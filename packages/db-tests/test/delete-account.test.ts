import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteAccount, type AccountStore } from "../../../supabase/functions/delete-account/process.ts";
import { addUser, asUser, createDb } from "./harness.ts";

let db: PGlite;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

/** Store com o banco real (RPCs de verdade); só o Storage e a API de admin são simulados e registram a ordem. */
function store(user: string, calls: string[], opts: { failHousehold?: boolean } = {}): AccountStore {
  return {
    me: async () => {
      const m = (await asUser(db, user, () => q("select m.household_id as id, h.name from public.members m join public.households h on h.id = m.household_id")))[0];
      return { userId: user, household: m ?? null };
    },
    memberCount: async (h) => (await asUser(db, user, () => q("select count(*)::int as n from public.members where household_id = $1", [h])))[0].n,
    purgeFiles: async (h) => { calls.push(`purge:${h}`); return 3; },
    leave: async () => { calls.push("leave"); await asUser(db, user, () => q("select public.leave_household()")); },
    deleteHousehold: async (name) => {
      calls.push("deleteHousehold");
      if (opts.failHousehold) throw new Error("falha simulada");
      await asUser(db, user, () => q("select public.delete_household($1)", [name]));
    },
    deleteAuthUser: async (id) => { calls.push("deleteUser"); await q("delete from auth.users where id = $1", [id]); },
  };
}

let ana: string, bia: string, carlos: string, hA: string, hB: string;

beforeEach(async () => {
  db = await createDb();
  [ana, bia, carlos] = await Promise.all(["ana", "bia", "carlos"].map((n) => addUser(db, `${n}@x.com`)));
  hA = await asUser(db, ana, async () => (await q("select public.create_household('Casa A','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  hB = await asUser(db, carlos, async () => (await q("select public.create_household('Casa B','Carlos') as id"))[0].id);
  const acc = (await q("select id from public.accounts where household_id=$1", [hA]))[0].id;
  await asUser(db, ana, () => q(`insert into public.goals (household_id, name, target_cents) values ($1,'Meta',100)`, [hA]));
  await asUser(db, ana, () => q(`insert into public.transactions (household_id, account_id, posted_on, description_raw, description_clean, amount_cents, kind, source, dedupe_hash, is_private, owner_user_id) values ($1,$2,'2026-10-01','PRIV','PRIV',100,'avista','manual','h1',true,$3)`, [hA, acc, ana]));
});

describe("excluir a conta", () => {
  it("única pessoa do casal: apaga arquivos, depois o casal, por último o usuário", async () => {
    const calls: string[] = [];
    const r = await deleteAccount(store(carlos, calls));
    expect(r).toEqual({ status: "ok", householdDeleted: true, filesPurged: 3 });
    expect(calls).toEqual([`purge:${hB}`, "deleteHousehold", "deleteUser"]);
    expect((await q("select count(*)::int as n from public.households where id = $1", [hB]))[0].n).toBe(0);
    expect((await q("select count(*)::int as n from auth.users where id = $1", [carlos]))[0].n).toBe(0);
    // o outro casal não foi tocado
    expect((await q("select count(*)::int as n from public.households where id = $1", [hA]))[0].n).toBe(1);
  });

  it("com par: só sai do casal (o par fica com tudo) e o usuário é apagado; nada de arquivos", async () => {
    const calls: string[] = [];
    const r = await deleteAccount(store(ana, calls));
    expect(r).toEqual({ status: "ok", householdDeleted: false, filesPurged: 0 });
    expect(calls).toEqual(["leave", "deleteUser"]);
    expect((await q("select user_id, role from public.members where household_id = $1", [hA]))).toEqual([{ user_id: bia, role: "owner" }]);
    expect((await q("select count(*)::int as n from public.goals where household_id = $1", [hA]))[0].n).toBe(1);
    expect((await q("select count(*)::int as n from public.transactions where description_raw = 'PRIV'"))[0].n).toBe(0); // gasto pessoal de quem saiu
    expect((await q("select count(*)::int as n from auth.users where id = $1", [ana]))[0].n).toBe(0);
  });

  it("usuário sem casal também pode apagar a conta", async () => {
    const eva = await addUser(db, "eva@x.com");
    const calls: string[] = [];
    expect(await deleteAccount(store(eva, calls))).toEqual({ status: "ok", householdDeleted: false, filesPurged: 0 });
    expect(calls).toEqual(["deleteUser"]);
  });

  it("se apagar o casal falhar, o usuário NÃO é apagado (dá para tentar de novo)", async () => {
    const calls: string[] = [];
    await expect(deleteAccount(store(carlos, calls, { failHousehold: true }))).rejects.toThrow("falha simulada");
    expect(calls).not.toContain("deleteUser");
    expect((await q("select count(*)::int as n from auth.users where id = $1", [carlos]))[0].n).toBe(1);
    expect((await q("select count(*)::int as n from public.households where id = $1", [hB]))[0].n).toBe(1);
  });

  it("é repetível: depois de sair do casal, tentar de novo conclui", async () => {
    const calls: string[] = [];
    await asUser(db, ana, () => q("select public.leave_household()")); // 1ª tentativa falhou depois de sair
    const r = await deleteAccount(store(ana, calls));
    expect(r.householdDeleted).toBe(false);
    expect(calls).toEqual(["deleteUser"]);
  });
});
