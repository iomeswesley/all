import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { buildManualRow } from "../../core/src/manual.ts";
import { addUser, asAnon, asUser, createDb, rejects } from "./harness.ts";

let db: PGlite;
let ana: string, bia: string, carlos: string;
let hA: string;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

async function insertManual(user: string, over: Record<string, unknown> = {}) {
  const account = await asUser(db, user, async () => (await q("select public.ensure_cash_account() as id"))[0].id);
  const row: Record<string, unknown> = { ...buildManualRow({ description: "Diarista", amountCents: 18000, date: "2026-10-10", method: "pix", categoryId: 6, ownerUserId: null, isPrivate: false }, crypto.randomUUID()), ...over };
  const full = { household_id: hA, account_id: account, description_clean: "Pix · Diarista", ...row };
  const keys = Object.keys(full);
  return asUser(db, user, async () => (await q(`insert into public.transactions (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(full)))[0].id as string);
}

beforeAll(async () => {
  db = await createDb();
  [ana, bia, carlos] = await Promise.all(["ana", "bia", "carlos"].map((n) => addUser(db, `${n}@x.com`)));
  hA = await asUser(db, ana, async () => (await q("select public.create_household('A','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  await asUser(db, carlos, () => q("select public.create_household('B','Carlos')"));
});

describe("conta Pix e dinheiro", () => {
  it("é criada uma vez por casal e o par usa a mesma", async () => {
    const a = await asUser(db, ana, async () => (await q("select public.ensure_cash_account() as id"))[0].id);
    const b = await asUser(db, bia, async () => (await q("select public.ensure_cash_account() as id"))[0].id);
    const c = await asUser(db, carlos, async () => (await q("select public.ensure_cash_account() as id"))[0].id);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(await q("select count(*)::int as n from public.accounts where institution = 'manual'")).toEqual([{ n: 2 }]);
  });
  it("exige login", async () => {
    expect(await rejects(asAnon(db, () => q("select public.ensure_cash_account()")), "permission denied")).toBe(true);
  });
});

describe("lançamento manual no painel", () => {
  it("aparece sem fatura, na competência do mês do pagamento, para os dois", async () => {
    const id = await insertManual(ana);
    const [row] = await asUser(db, bia, () => q("select statement_month, source, amount_cents::int as c from public.v_transactions where id = $1", [id]));
    expect(row).toEqual({ statement_month: "2026-10", source: "manual", c: 18000 });
    expect(await asUser(db, carlos, () => q("select * from public.v_transactions"))).toEqual([]);
  });

  it("só manual pode existir sem fatura", async () => {
    const account = (await q("select id from public.accounts where household_id = $1", [hA]))[0].id;
    const err = await db.query(
      "insert into public.transactions (household_id, account_id, posted_on, description_raw, description_clean, amount_cents, kind, source, dedupe_hash) values ($1,$2,'2026-10-01','X','X',1,'avista','pdf','orfa')",
      [hA, account],
    ).then(() => "sem erro", (e: Error) => e.message);
    expect(err).toContain("statement_required");
  });

  it("o par pode corrigir a categoria; o outro casal não", async () => {
    const id = await insertManual(ana, { category_id: 12, category_source: "none", needs_review: true });
    expect((await asUser(db, bia, () => db.query("update public.transactions set category_id = 6, needs_review = false where id = $1", [id]))).affectedRows).toBe(1);
    expect((await asUser(db, carlos, () => db.query("update public.transactions set category_id = 1 where id = $1", [id]))).affectedRows).toBe(0);
  });

  it("gasto pessoal manual: o par vê só o total por categoria", async () => {
    await insertManual(bia, { is_private: true, owner_user_id: bia, amount_cents: 7000, category_id: 8, description_raw: "PIX SURPRESA" });
    await insertManual(bia, { is_private: true, owner_user_id: bia, amount_cents: 3000, category_id: 8, description_raw: "PIX PRESENTE" });
    expect((await asUser(db, ana, () => q("select description_raw from public.v_transactions where is_private"))).length).toBe(0);
    const totals = await asUser(db, ana, () => q("select statement_month, category_id, total_cents::int as total, n from public.partner_private_totals()"));
    expect(totals).toEqual([{ statement_month: "2026-10", category_id: 8, total: 10000, n: 2 }]);
  });
});
