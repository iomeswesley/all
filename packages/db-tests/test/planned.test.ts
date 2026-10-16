import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addUser, asAnon, asUser, createDb, rejects } from "./harness.ts";

let db: PGlite;
let ana: string, bia: string, carlos: string;
let hA: string;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const insert = (user: string, h: string, extra = "", vals: unknown[] = []) =>
  asUser(db, user, () => q(`insert into public.planned_expenses (household_id, description, amount_cents, first_date${extra ? ", " + extra : ""}) values ($1, 'IPVA', 250000, '2027-01-20'${vals.map((_, i) => `, $${i + 2}`).join("")}) returning *`, [h, ...vals]));

beforeAll(async () => {
  db = await createDb();
  [ana, bia, carlos] = await Promise.all(["ana", "bia", "carlos"].map((n) => addUser(db, `${n}@x.com`)));
  hA = await asUser(db, ana, async () => (await q("select public.create_household('A','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  await asUser(db, carlos, () => q("select public.create_household('B','Carlos')"));
});

describe("gastos planejados", () => {
  it("o casal cria, vê, edita e apaga; quem criou é registrado", async () => {
    const [row] = await insert(ana, hA);
    expect(row.created_by).toBe(ana);
    expect(row.repeat).toBe("once");
    await asUser(db, bia, () => q("update public.planned_expenses set amount_cents = 260000 where id = $1", [row.id]));
    expect(await asUser(db, ana, () => q("select amount_cents::int as c from public.planned_expenses where id = $1", [row.id]))).toEqual([{ c: 260000 }]);
    await insert(bia, hA, "repeat, occurrences", ["monthly", 10]);
    expect((await asUser(db, bia, () => q("select * from public.planned_expenses"))).length).toBe(2);
    await asUser(db, bia, () => q("delete from public.planned_expenses where id = $1", [row.id]));
    expect((await asUser(db, ana, () => q("select * from public.planned_expenses"))).length).toBe(1);
  });

  it("valores e repetições inválidos são recusados", async () => {
    expect(await rejects(asUser(db, ana, () => q("insert into public.planned_expenses (household_id, description, amount_cents, first_date) values ($1,'x',0,'2027-01-01')", [hA])))).toBe(true);
    expect(await rejects(asUser(db, ana, () => q("insert into public.planned_expenses (household_id, description, amount_cents, first_date) values ($1,'  ',100,'2027-01-01')", [hA])))).toBe(true);
    expect(await rejects(insert(ana, hA, "repeat", ["weekly"]))).toBe(true);
    expect(await rejects(insert(ana, hA, "repeat, occurrences", ["monthly", 0]))).toBe(true);
    expect(await rejects(insert(ana, hA, "repeat, occurrences", ["once", 3]))).toBe(true);
  });

  it("outro casal não vê, não altera e não grava no casal alheio; anônimo não vê", async () => {
    expect(await asUser(db, carlos, () => q("select * from public.planned_expenses"))).toEqual([]);
    expect((await asUser(db, carlos, () => db.query("update public.planned_expenses set amount_cents = 1"))).affectedRows).toBe(0);
    expect((await asUser(db, carlos, () => db.query("delete from public.planned_expenses"))).affectedRows).toBe(0);
    expect(await rejects(insert(carlos, hA))).toBe(true);
    const anon = await asAnon(db, () => q("select * from public.planned_expenses")).catch(() => []);
    expect(anon).toEqual([]);
  });

  it("entra na exportação de dados e não impede apagar o usuário", async () => {
    const data = await asUser(db, ana, async () => (await q("select public.export_household_data() as d"))[0].d);
    expect(data.planned_expenses).toHaveLength(1);
    await q("delete from auth.users where id = $1", [bia]); // created_by vira null
    expect((await q("select created_by from public.planned_expenses"))[0].created_by).toBeNull();
  });
});
