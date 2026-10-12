import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addUser, asAnon, asUser, createDb, rejects } from "./harness.ts";

let db: PGlite;
let ana: string, bia: string, carlos: string;
let hA: string, accA: string, stA: string, hB: string;

const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const insertTx = (user: string, over: Record<string, unknown>) => {
  const row = { household_id: hA, account_id: accA, statement_id: stA, posted_on: "2026-08-04", description_raw: "X", description_clean: "X", amount_cents: 1000, kind: "avista", section: "despesas", category_id: 8, dedupe_hash: crypto.randomUUID(), ...over };
  const keys = Object.keys(row);
  return asUser(db, user, () => q(`insert into public.transactions (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(row)));
};

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
     values ($1,$2,'2026-08-31','2026-09-06',100000,100000,'ok',$3,'s1',$4) returning id`, [hA, accA, `${hA}/a.pdf`, ana]))[0].id);
});

describe("gasto pessoal", () => {
  it("exige dono", async () => {
    // pela API (RLS) a linha é recusada; direto no banco, a constraint recusa
    expect(await rejects(insertTx(ana, { is_private: true, owner_user_id: null }))).toBe(true);
    const err = await q("insert into public.transactions (household_id, account_id, statement_id, posted_on, description_raw, description_clean, amount_cents, kind, dedupe_hash, is_private) values ($1,$2,$3,'2026-08-04','X','X',1,'avista','h-priv-null',true)", [hA, accA, stA]).then(() => "sem erro", (e: Error) => e.message);
    expect(err).toContain("private_has_owner");
    // e não dá para criar gasto pessoal em nome do par
    expect(await rejects(insertTx(ana, { is_private: true, owner_user_id: bia }))).toBe(true);
  });

  it("o par vê só o total por categoria; o dono vê os itens; o outro casal não vê nada", async () => {
    await insertTx(bia, { is_private: true, owner_user_id: bia, description_raw: "SURPRESA", amount_cents: 7000, category_id: 8 });
    await insertTx(bia, { is_private: true, owner_user_id: bia, description_raw: "PRESENTE", amount_cents: 3000, category_id: 8 });
    await insertTx(bia, { is_private: true, owner_user_id: bia, description_raw: "LIVRO", amount_cents: 2500, category_id: 9 });
    await insertTx(ana, { description_raw: "COMUM", amount_cents: 500 });
    await asUser(db, ana, () => q("select public.confirm_statement($1)", [stA]));

    // Ana não enxerga os itens da Bia…
    const seen = await asUser(db, ana, () => q("select description_raw from public.v_transactions order by 1"));
    expect(seen.map((r: any) => r.description_raw)).toEqual(["COMUM"]);
    // …mas vê os totais por categoria (sem descrição).
    const totals = await asUser(db, ana, () => q("select * from public.partner_private_totals() order by category_id"));
    expect(totals).toEqual([
      { statement_month: "2026-09", category_id: 8, owner_user_id: bia, total_cents: "10000", n: 2 },
      { statement_month: "2026-09", category_id: 9, owner_user_id: bia, total_cents: "2500", n: 1 },
    ].map((r) => ({ ...r, total_cents: Number(r.total_cents) })).map((r) => ({ ...r })) as any);
    expect(Object.keys(totals[0])).not.toContain("description_raw");
    // Bia vê os próprios itens e nenhum "total do parceiro" sobre si mesma
    expect((await asUser(db, bia, () => q("select description_raw from public.v_transactions where is_private"))).length).toBe(3);
    expect(await asUser(db, bia, () => q("select * from public.partner_private_totals()"))).toEqual([]);
    // Carlos (outro casal) não vê nada
    expect(await asUser(db, carlos, () => q("select * from public.partner_private_totals()"))).toEqual([]);
    expect(await rejects(asAnon(db, () => q("select * from public.partner_private_totals()")), "permission denied")).toBe(true);
  });

  it("somas ocultas da fatura (para a conferência do par fechar)", async () => {
    const a = await asUser(db, ana, () => q("select * from public.statement_hidden_sums($1)", [stA]));
    expect(a.map((r: any) => ({ e: Number(r.expenses_cents), n: r.n }))).toEqual([{ e: 12500, n: 3 }]);
    const b = await asUser(db, bia, () => q("select * from public.statement_hidden_sums($1)", [stA]));
    expect(Number(b[0].expenses_cents)).toBe(0);
    expect(Number((await asUser(db, carlos, () => q("select * from public.statement_hidden_sums($1)", [stA])))[0].expenses_cents)).toBe(0);
  });

  it("o par não consegue alterar nem apagar o gasto pessoal alheio", async () => {
    const upd = await asUser(db, ana, () => db.query("update public.transactions set amount_cents = 1 where description_raw = 'SURPRESA'"));
    expect(upd.affectedRows).toBe(0);
    const del = await asUser(db, ana, () => db.query("delete from public.transactions where description_raw = 'SURPRESA'"));
    expect(del.affectedRows).toBe(0);
  });
});

describe("push e alertas de orçamento", () => {
  const token = "ExponentPushToken[abcdefghijklmnop]";
  it("cada pessoa registra o próprio token; o par lê, mas não altera", async () => {
    await asUser(db, bia, () => q("insert into public.push_tokens (user_id, household_id, token, platform) values ($1,$2,$3,'android')", [bia, hA, token]));
    expect((await asUser(db, ana, () => q("select user_id from public.push_tokens"))).map((r: any) => r.user_id)).toEqual([bia]);
    expect(await rejects(asUser(db, ana, () => q("insert into public.push_tokens (user_id, household_id, token) values ($1,$2,$3)", [bia, hA, "ExponentPushToken[forjado]"])))).toBe(true);
    const del = await asUser(db, ana, () => db.query("delete from public.push_tokens"));
    expect(del.affectedRows).toBe(0);
    expect(await rejects(asUser(db, bia, () => q("insert into public.push_tokens (user_id, household_id, token) values ($1,$2,'lixo')", [bia, hA])))).toBe(true);
    expect(await asUser(db, carlos, () => q("select * from public.push_tokens"))).toEqual([]);
  });

  it("orçamentos e alertas são do casal e o alerta não duplica", async () => {
    await asUser(db, ana, () => q("insert into public.budgets (household_id, category_id, month, limit_cents) values ($1,8,'2026-09-01',20000)", [hA]));
    expect((await asUser(db, bia, () => q("select limit_cents from public.budgets"))).length).toBe(1);
    expect(await asUser(db, carlos, () => q("select * from public.budgets"))).toEqual([]);
    await asUser(db, ana, () => q("insert into public.budget_alerts (household_id, category_id, month, level) values ($1,8,'2026-09-01','warn80')", [hA]));
    expect(await rejects(asUser(db, bia, () => q("insert into public.budget_alerts (household_id, category_id, month, level) values ($1,8,'2026-09-01','warn80')", [hA])), "duplicate")).toBe(true);
    expect(await rejects(asUser(db, carlos, () => q("insert into public.budget_alerts (household_id, category_id, month, level) values ($1,8,'2026-09-01','over100')", [hA])))).toBe(true);
    void hB;
  });
});
