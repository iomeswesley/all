import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addUser, asUser, createDb } from "./harness.ts";

let db: PGlite;
let ana: string, bia: string, carlos: string, hA: string;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const exportAs = async (u: string) => asUser(db, u, async () => (await q("select public.export_household_data() as d"))[0].d);

beforeAll(async () => {
  db = await createDb();
  [ana, bia, carlos] = await Promise.all(["ana", "bia", "carlos"].map((n) => addUser(db, `${n}@x.com`)));
  hA = await asUser(db, ana, async () => (await q("select public.create_household('A','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  await asUser(db, carlos, () => q("select public.create_household('B','Carlos')"));
  await asUser(db, ana, () => q("insert into public.member_incomes (household_id, user_id, income_cents) values ($1,$2,800000)", [hA, ana]));
});

describe("exportação de dados inclui os recursos do casal", () => {
  it("tem as chaves novas e cada um exporta só a própria renda", async () => {
    const a = await exportAs(ana);
    for (const k of ["split_rules", "split_overrides", "settlements", "my_income", "member_allowances", "tx_comments", "tx_reactions", "money_dates", "planned_matches", "planned_expenses"]) {
      expect(Array.isArray(a[k]), k).toBe(true);
    }
    expect(a.my_income).toHaveLength(1);
    const b = await exportAs(bia);
    expect(b.my_income).toEqual([]);
    const c = await exportAs(carlos);
    expect(c.my_income).toEqual([]);
  });
});
