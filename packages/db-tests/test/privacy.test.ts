import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { addUser, asAnon, asUser, createDb, rejects } from "./harness.ts";

let db: PGlite;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

interface World { ana: string; bia: string; carlos: string; hA: string; hB: string; accA: string; stA: string }

/** Casal A (Ana dona + Bia) com fatura confirmada, gasto pessoal, regra, cartão e token; casal B (Carlos) à parte. */
async function world(): Promise<World> {
  db = await createDb();
  const [ana, bia, carlos] = await Promise.all(["ana", "bia", "carlos"].map((n) => addUser(db, `${n}@x.com`)));
  const hA = await asUser(db, ana, async () => (await q("select public.create_household('Casa A','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  const hB = await asUser(db, carlos, async () => (await q("select public.create_household('Casa B','Carlos') as id"))[0].id);
  const accA = (await q("select id from public.accounts where household_id=$1", [hA]))[0].id;
  const stA = await asUser(db, ana, async () => (await q(
    `insert into public.statements (household_id, account_id, closing_date, due_date, declared_total_cents, computed_total_cents, reconcile_status, file_path, file_sha256, created_by, confirmed_by, status)
     values ($1,$2,'2026-08-31','2026-09-06',1,1,'ok',$3,'s1',$4,$4,'confirmed') returning id`, [hA, accA, `${hA}/a.pdf`, ana]))[0].id);
  const tx = (user: string, desc: string, cents: number, over = "") =>
    asUser(db, user, () => q(`insert into public.transactions (household_id, account_id, statement_id, posted_on, description_raw, description_clean, amount_cents, kind, dedupe_hash, ${over ? "is_private, owner_user_id," : ""} category_id) values ($1,$2,$3,'2026-08-04',$4,$4,$5,'avista',$4 ${over ? ",true,$6" : ""}, 8)`, over ? [hA, accA, stA, desc, cents, over] : [hA, accA, stA, desc, cents]));
  await tx(ana, "COMUM", 1000);
  await tx(ana, "PRIVADO ANA", 700, ana);
  await tx(bia, "PRIVADO BIA", 900, bia);
  await asUser(db, bia, () => q("update public.transactions set owner_user_id = $1 where description_raw = 'COMUM'", [bia]));
  await asUser(db, ana, () => q("insert into public.rules (household_id, pattern, match_type, category_id, owner_user_id, created_by) values ($1,'X','contains',1,$2,$2)", [hA, bia]));
  await asUser(db, ana, () => q("insert into public.account_cards (account_id, household_id, last4, holder_user_id) values ($1,$2,'1111',$3)", [accA, hA, bia]));
  await asUser(db, bia, () => q("insert into public.push_tokens (user_id, household_id, token) values ($1,$2,'ExponentPushToken[bbbbbbbbbbbbbbbb]')", [bia, hA]));
  return { ana, bia, carlos, hA, hB, accA, stA };
}

describe("exportar meus dados", () => {
  let w: World;
  beforeEach(async () => { w = await world(); });

  it("traz o que a pessoa vê; gasto pessoal do par e segredos ficam de fora", async () => {
    const data = await asUser(db, w.ana, async () => (await q("select public.export_household_data() as d"))[0].d);
    expect(data.household.name).toBe("Casa A");
    expect(data.members).toHaveLength(2);
    const descs = data.transactions.map((t: any) => t.description_raw).sort();
    expect(descs).toEqual(["COMUM", "PRIVADO ANA"]); // sem "PRIVADO BIA"
    expect(data.transactions.every((t: any) => !("dedupe_hash" in t))).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/ExponentPushToken|"token"/);
    expect(data.rules).toHaveLength(1);
    expect(data.note).toMatch(/gastos pessoais do seu par/);
  });
  it("outro casal só exporta o próprio; anônimo não exporta", async () => {
    const b = await asUser(db, w.carlos, async () => (await q("select public.export_household_data() as d"))[0].d);
    expect(b.household.name).toBe("Casa B");
    expect(b.transactions).toEqual([]);
    expect(await rejects(asAnon(db, () => q("select public.export_household_data()")), "permission denied")).toBe(true);
  });
});

describe("sair do casal e remover membro", () => {
  let w: World;
  beforeEach(async () => { w = await world(); });

  it("quem sai perde os gastos pessoais; o resto fica 'nosso'; dono é promovido", async () => {
    await asUser(db, w.ana, () => q("select public.leave_household()")); // Ana (dona) sai
    // Ana não vê mais nada do casal
    expect(await asUser(db, w.ana, () => q("select * from public.transactions"))).toEqual([]);
    expect(await asUser(db, w.ana, () => q("select * from public.members"))).toEqual([]);
    // Bia continua e virou dona
    expect(await asUser(db, w.bia, () => q("select user_id, role from public.members"))).toEqual([{ user_id: w.bia, role: "owner" }]);
    const left = (await q("select description_raw, owner_user_id, is_private from public.transactions order by description_raw")).map((t: any) => [t.description_raw, t.owner_user_id, t.is_private]);
    expect(left).toEqual([["COMUM", w.bia, false], ["PRIVADO BIA", w.bia, true]]); // "PRIVADO ANA" apagado; o da Bia intacto
    // Ana pode criar outro casal
    await asUser(db, w.ana, () => q("select public.create_household('Nova casa','Ana')"));
  });

  it("limpa o que apontava para quem saiu (dono de transação, de regra e de cartão; tokens)", async () => {
    await asUser(db, w.bia, () => q("select public.leave_household()"));
    expect(await q("select owner_user_id from public.transactions where description_raw = 'COMUM'")).toEqual([{ owner_user_id: null }]);
    expect(await q("select owner_user_id from public.rules")).toEqual([{ owner_user_id: null }]);
    expect(await q("select holder_user_id from public.account_cards")).toEqual([{ holder_user_id: null }]);
    expect(await q("select * from public.push_tokens")).toEqual([]);
  });

  it("a última pessoa não 'sai': tem de excluir o casal", async () => {
    await asUser(db, w.carlos, async () => {
      expect(await rejects(q("select public.leave_household()"), "last_member")).toBe(true);
    });
  });

  it("o dono remove o par; o par não remove o dono; ninguém se remove", async () => {
    expect(await rejects(asUser(db, w.bia, () => q("select public.remove_member($1)", [w.ana])), "not_owner")).toBe(true);
    expect(await rejects(asUser(db, w.ana, () => q("select public.remove_member($1)", [w.ana])), "cannot_remove_self")).toBe(true);
    expect(await rejects(asUser(db, w.ana, () => q("select public.remove_member($1)", [w.carlos])), "member_not_found")).toBe(true);
    await asUser(db, w.ana, () => q("select public.remove_member($1)", [w.bia]));
    expect((await q("select user_id from public.members where household_id = $1", [w.hA])).map((m: any) => m.user_id)).toEqual([w.ana]);
    expect(await q("select description_raw from public.transactions where is_private and owner_user_id = $1", [w.bia])).toEqual([]);
  });
});

describe("excluir o casal", () => {
  let w: World;
  beforeEach(async () => { w = await world(); });

  it("exige o nome certo e ser dono; apaga tudo do casal e só dele", async () => {
    expect(await rejects(asUser(db, w.ana, () => q("select public.delete_household('errado')")), "confirm_mismatch")).toBe(true);
    expect(await rejects(asUser(db, w.bia, () => q("select public.delete_household('Casa A')")), "not_owner")).toBe(true);
    await asUser(db, w.ana, () => q("select public.delete_household(' casa a ')"));
    for (const t of ["households", "members", "accounts", "statements", "transactions", "rules", "account_cards", "push_tokens"]) {
      const n = (await q(`select count(*)::int as n from public.${t} where ${t === "households" ? "id" : "household_id"} = $1`, [w.hA]))[0].n;
      expect(n, t).toBe(0);
    }
    expect((await q("select count(*)::int as n from public.households where id = $1", [w.hB]))[0].n).toBe(1);
    expect((await q("select count(*)::int as n from public.accounts where household_id = $1", [w.hB]))[0].n).toBe(1);
  });

  it("a única pessoa do casal exclui mesmo sem ser 'dona' registrada", async () => {
    await asUser(db, w.ana, () => q("select public.leave_household()")); // Bia vira dona e única
    await asUser(db, w.bia, () => q("select public.delete_household('Casa A')"));
    expect((await q("select count(*)::int as n from public.households where id = $1", [w.hA]))[0].n).toBe(0);
  });
});

describe("excluir a conta (usuário) não é bloqueada por vínculos", () => {
  it("quem criou casal, confirmou fatura, criou regra e convite pode ser apagado depois de sair", async () => {
    const w = await world();
    await asUser(db, w.ana, () => q("select public.leave_household()"));
    await q("delete from auth.users where id = $1", [w.ana]); // não pode falhar por chave estrangeira
    expect((await q("select created_by from public.households where id = $1", [w.hA]))[0].created_by).toBeNull();
    expect((await q("select created_by, confirmed_by from public.statements where id = $1", [w.stA]))[0]).toEqual({ created_by: null, confirmed_by: null });
    expect((await q("select created_by from public.rules"))[0].created_by).toBe(w.bia); // criada pela Bia: intacta
    // o casal segue funcionando para a Bia
    expect((await asUser(db, w.bia, () => q("select count(*)::int as n from public.v_transactions")))[0].n).toBeGreaterThan(0);
  });
  it("o usuário da última pessoa: excluir o casal e depois a conta limpa tudo", async () => {
    const w = await world();
    await asUser(db, w.carlos, () => q("select public.delete_household('Casa B')"));
    await q("delete from auth.users where id = $1", [w.carlos]);
    expect((await q("select count(*)::int as n from auth.users where id = $1", [w.carlos]))[0].n).toBe(0);
  });
});

describe("novas colunas e status", () => {
  it("statements aceita formatos e o status 'unverified'", async () => {
    const w = await world();
    const ok = await asUser(db, w.ana, () => q(
      `insert into public.statements (household_id, account_id, closing_date, due_date, declared_total_cents, computed_total_cents, reconcile_status, format, file_path, file_sha256, created_by)
       values ($1,$2,'2026-10-31','2026-10-31',5,5,'unverified','ofx',$3,'s2',$4) returning format, reconcile_status`, [w.hA, w.accA, `${w.hA}/b.ofx`, w.ana]));
    expect(ok).toEqual([{ format: "ofx", reconcile_status: "unverified" }]);
    expect(await rejects(asUser(db, w.ana, () => q("update public.statements set format = 'xlsx' where file_sha256 = 's2'")))).toBe(true);
    expect(await rejects(asUser(db, w.ana, () => q("update public.statements set reconcile_status = 'talvez' where file_sha256 = 's2'")))).toBe(true);
  });
});
