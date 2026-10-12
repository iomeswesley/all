import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addUser, asAnon, asUser, createDb, rejects } from "./harness.ts";

let db: PGlite;
let ana: string, bia: string, carlos: string;
let hA: string, hB: string, accA: string, stA: string, txA: string;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeAll(async () => {
  db = await createDb();
  [ana, bia, carlos] = await Promise.all(["ana", "bia", "carlos"].map((n) => addUser(db, `${n}@x.com`)));
  hA = await asUser(db, ana, async () => (await q("select public.create_household('A','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  hB = await asUser(db, carlos, async () => (await q("select public.create_household('B','Carlos') as id"))[0].id);
  accA = (await q("select id from public.accounts where household_id=$1", [hA]))[0].id;
  stA = await asUser(db, ana, async () => (await q(
    `insert into public.statements (household_id, account_id, closing_date, due_date, declared_total_cents, computed_total_cents, reconcile_status, file_path, file_sha256, created_by)
     values ($1,$2,'2026-08-31','2026-09-06',1,1,'ok',$3,'s',$4) returning id`, [hA, accA, `${hA}/a.pdf`, ana]))[0].id);
  txA = await asUser(db, ana, async () => (await q(
    `insert into public.transactions (household_id, account_id, statement_id, posted_on, description_raw, description_clean, amount_cents, kind, dedupe_hash, category_id)
     values ($1,$2,$3,'2026-03-10','CLINICA','Clínica',35000,'avista','h1',5) returning id`, [hA, accA, stA]))[0].id);
});

describe("IR: dedutível, tipo e comprovante", () => {
  it("marca como dedutível com tipo e anexa comprovante na pasta do casal", async () => {
    await asUser(db, bia, () => q("update public.transactions set tax_deductible = true, tax_kind = 'saude', attachment_path = $2 where id = $1", [txA, `${hA}/${txA}.jpg`]));
    expect(await q("select tax_deductible, tax_kind, attachment_path from public.transactions where id = $1", [txA])).toEqual([{ tax_deductible: true, tax_kind: "saude", attachment_path: `${hA}/${txA}.jpg` }]);
  });
  it("tipo inválido e comprovante de outro casal são recusados", async () => {
    expect(await rejects(asUser(db, ana, () => q("update public.transactions set tax_kind = 'luxo' where id = $1", [txA])))).toBe(true);
    expect(await rejects(asUser(db, ana, () => q("update public.transactions set attachment_path = $2 where id = $1", [txA, `${hB}/roubado.jpg`])), "attachment_in_household")).toBe(true);
  });
  it("o outro casal não marca nem enxerga", async () => {
    const upd = await asUser(db, carlos, () => db.query("update public.transactions set tax_deductible = false where id = $1", [txA]));
    expect(upd.affectedRows).toBe(0);
    expect(await asUser(db, carlos, () => q("select * from public.transactions"))).toEqual([]);
  });
});

describe("bucket de comprovantes", () => {
  it("é privado e cada casal só acessa a própria pasta", async () => {
    expect((await q("select id, public from storage.buckets order by id")).map((b: any) => [b.id, b.public])).toEqual([["receipts", false], ["statements", false]]);
    await asUser(db, ana, () => q("insert into storage.objects (bucket_id, name) values ('receipts', $1)", [`${hA}/nota.jpg`]));
    expect(await rejects(asUser(db, ana, () => q("insert into storage.objects (bucket_id, name) values ('receipts', $1)", [`${hB}/nota.jpg`])))).toBe(true);
    expect((await asUser(db, bia, () => q("select name from storage.objects where bucket_id = 'receipts'"))).length).toBe(1);
    expect(await asUser(db, carlos, () => q("select name from storage.objects where bucket_id = 'receipts'"))).toEqual([]);
    expect((await asUser(db, carlos, () => db.query("delete from storage.objects where bucket_id = 'receipts'"))).affectedRows).toBe(0);
    // anônimo: sem acesso (erro de permissão ou nenhuma linha — nunca um arquivo)
    const anon = await asAnon(db, () => q("select name from storage.objects")).catch(() => []);
    expect(anon).toEqual([]);
  });
});

describe("configurações, metas e perguntas salvas", () => {
  it("renda e fixos são do casal; valores negativos são recusados", async () => {
    await asUser(db, ana, () => q("insert into public.household_settings (household_id, monthly_income_cents, other_fixed_cents) values ($1, 1500000, 400000)", [hA]));
    expect((await asUser(db, bia, () => q("select monthly_income_cents::int as i, education_limit_cents::int as e from public.household_settings")))).toEqual([{ i: 1500000, e: 356150 }]);
    expect(await asUser(db, carlos, () => q("select * from public.household_settings"))).toEqual([]);
    expect(await rejects(asUser(db, ana, () => q("update public.household_settings set monthly_income_cents = -1")))).toBe(true);
    expect(await rejects(asUser(db, carlos, () => q("insert into public.household_settings (household_id) values ($1)", [hA])))).toBe(true);
  });

  it("metas: o casal vê as mesmas; meta inválida é recusada; outro casal não vê", async () => {
    await asUser(db, ana, () => q("insert into public.goals (household_id, name, target_cents, saved_cents, due_date) values ($1,'Viagem',1200000,300000,'2027-04-15')", [hA]));
    await asUser(db, bia, () => q("update public.goals set saved_cents = saved_cents + 50000 where name = 'Viagem'"));
    expect((await asUser(db, ana, () => q("select saved_cents::int as s from public.goals")))).toEqual([{ s: 350000 }]);
    expect(await rejects(asUser(db, ana, () => q("insert into public.goals (household_id, name, target_cents) values ($1,'x',0)", [hA])))).toBe(true);
    expect(await asUser(db, carlos, () => q("select * from public.goals"))).toEqual([]);
  });

  it("perguntas salvas são do casal; não dá para salvar em nome do par", async () => {
    await asUser(db, ana, () => q("insert into public.saved_queries (household_id, created_by, name, question) values ($1,$2,'Restaurante','quanto gastamos com restaurante desde julho?')", [hA, ana]));
    expect((await asUser(db, bia, () => q("select name from public.saved_queries"))).length).toBe(1);
    expect(await rejects(asUser(db, ana, () => q("insert into public.saved_queries (household_id, created_by, name, question) values ($1,$2,'x','forjada')", [hA, bia])))).toBe(true);
    expect(await rejects(asUser(db, carlos, () => q("insert into public.saved_queries (household_id, created_by, name, question) values ($1,$2,'x','invasao')", [hA, carlos])))).toBe(true);
    expect(await asUser(db, carlos, () => q("select * from public.saved_queries"))).toEqual([]);
    expect((await asUser(db, carlos, () => db.query("delete from public.saved_queries"))).affectedRows).toBe(0);
  });
});
