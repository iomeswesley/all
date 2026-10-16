import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { buildManualRow } from "../../core/src/manual.ts";
import { addUser, asAnon, asUser, createDb, rejects } from "./harness.ts";

let db: PGlite;
let ana: string, bia: string, carlos: string;
let hA: string, hB: string;
let pA: string, pB: string, txA: string, txB: string;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

const planned = (user: string, h: string) =>
  asUser(db, user, async () => (await q("insert into public.planned_expenses (household_id, description, amount_cents, first_date, repeat) values ($1, 'Escola', 120000, '2026-09-05', 'monthly') returning id", [h]))[0].id as string);

async function manualTx(user: string, h: string) {
  const account = await asUser(db, user, async () => (await q("select public.ensure_cash_account() as id"))[0].id);
  const row = buildManualRow({ description: "Colégio", amountCents: 120000, date: "2026-09-05", method: "pix", categoryId: null, ownerUserId: null, isPrivate: false }, crypto.randomUUID());
  const full: Record<string, unknown> = { household_id: h, account_id: account, description_clean: "Pix · Colégio", ...row };
  const keys = Object.keys(full);
  return asUser(db, user, async () => (await q(`insert into public.transactions (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(full)))[0].id as string);
}

const mark = (user: string, h: string, plannedId: string, date: string, status: string, txId: string | null = null) =>
  asUser(db, user, async () => (await q("insert into public.planned_matches (household_id, planned_id, occurrence_date, transaction_id, status) values ($1,$2,$3,$4,$5) returning *", [h, plannedId, date, txId, status]))[0]);

beforeAll(async () => {
  db = await createDb();
  [ana, bia, carlos] = await Promise.all(["ana", "bia", "carlos"].map((n) => addUser(db, `${n}@x.com`)));
  hA = await asUser(db, ana, async () => (await q("select public.create_household('A','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  hB = await asUser(db, carlos, async () => (await q("select public.create_household('B','Carlos') as id"))[0].id);
  pA = await planned(ana, hA);
  pB = await planned(carlos, hB);
  txA = await manualTx(ana, hA);
  txB = await manualTx(carlos, hB);
});

describe("baixa de gasto planejado", () => {
  it("o casal dá baixa com lançamento e o par vê; quem marcou é registrado", async () => {
    const row = await mark(ana, hA, pA, "2026-09-05", "feito", txA);
    expect(row.created_by).toBe(ana);
    expect((await asUser(db, bia, () => q("select status, transaction_id from public.planned_matches"))).map((r) => [r.status, r.transaction_id])).toEqual([["feito", txA]]);
  });

  it("uma baixa 'feito' por ocorrência e um lançamento só; status inválido é recusado", async () => {
    expect(await rejects(mark(bia, hA, pA, "2026-09-05", "feito"))).toBe(true);
    expect(await rejects(mark(bia, hA, pA, "2026-10-05", "feito", txA))).toBe(true);
    expect(await rejects(mark(bia, hA, pA, "2026-10-05", "talvez"))).toBe(true);
    await mark(bia, hA, pA, "2026-10-05", "ignorado", txA); // "não é" de outro par vale
    expect(await rejects(mark(bia, hA, pA, "2026-10-05", "ignorado", txA))).toBe(true);
    await mark(bia, hA, pA, "2026-11-05", "feito"); // marcado à mão, sem lançamento
  });

  it("não aceita planejado ou lançamento de outro casal", async () => {
    expect(await rejects(mark(ana, hA, pB, "2026-09-05", "feito"))).toBe(true);
    expect(await rejects(mark(ana, hA, pA, "2026-12-05", "feito", txB))).toBe(true);
    expect(await rejects(mark(carlos, hB, pA, "2026-09-05", "feito"))).toBe(true);
  });

  it("outro casal não vê, não altera e não grava no casal alheio; anônimo não vê", async () => {
    expect(await asUser(db, carlos, () => q("select * from public.planned_matches"))).toEqual([]);
    expect((await asUser(db, carlos, () => db.query("update public.planned_matches set status = 'ignorado'"))).affectedRows).toBe(0);
    expect((await asUser(db, carlos, () => db.query("delete from public.planned_matches"))).affectedRows).toBe(0);
    expect(await rejects(mark(carlos, hA, pA, "2027-01-05", "feito"))).toBe(true);
    const anon = await asAnon(db, () => q("select * from public.planned_matches")).catch(() => []);
    expect(anon).toEqual([]);
  });

  it("cascatas: lançamento apagado mantém a baixa; usuário apagado vira null; planejado apagado leva as baixas", async () => {
    await asUser(db, ana, () => q("delete from public.transactions where id = $1", [txA]));
    const rows = await asUser(db, ana, () => q("select status, transaction_id from public.planned_matches where occurrence_date = '2026-09-05'"));
    expect(rows).toEqual([{ status: "feito", transaction_id: null }]);
    await q("delete from auth.users where id = $1", [ana]);
    expect((await q("select distinct created_by from public.planned_matches where household_id = $1 and occurrence_date = '2026-09-05'", [hA]))[0].created_by).toBeNull();
    await asUser(db, bia, () => q("delete from public.planned_expenses where id = $1", [pA]));
    expect(await q("select * from public.planned_matches where household_id = $1", [hA])).toEqual([]);
  });
});
