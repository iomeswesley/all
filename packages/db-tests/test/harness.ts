import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const migrationsDir = path.resolve(import.meta.dirname, "../../../supabase/migrations");

/** Imita o que o Supabase já traz pronto: schemas auth/storage, papéis e privilégios padrão. */
const SUPABASE_SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid default auth.uid()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
$$;

grant usage on schema auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select on storage.buckets to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`;

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    try {
      await db.exec(fs.readFileSync(path.join(migrationsDir, f), "utf8"));
    } catch (e) {
      throw new Error(`Falha na migration ${f}: ${(e as Error).message}`);
    }
  }
  return db;
}

export async function addUser(db: PGlite, email: string): Promise<string> {
  const r = await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
  return r.rows[0]!.id;
}

/** Executa como um usuário logado (papel `authenticated`, RLS valendo). */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

/** True se a promessa foi rejeitada (opcionalmente com mensagem contendo `text`). */
export async function rejects(p: Promise<unknown>, text?: string): Promise<boolean> {
  try {
    await p;
    return false;
  } catch (e) {
    return text ? String((e as Error).message).includes(text) : true;
  }
}
