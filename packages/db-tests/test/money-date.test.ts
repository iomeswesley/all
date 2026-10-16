import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addUser, asAnon, asUser, createDb, rejects } from "./harness.ts";

let db: PGlite;
let ana: string, bia: string, carlos: string;
let hA: string;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const upsert = (user: string, h: string, month: string, agreements: unknown, toCancel: unknown = []) =>
  asUser(db, user, () =>
    q(
      `insert into public.money_dates (household_id, month, agreements, to_cancel) values ($1, $2, $3::jsonb, $4::jsonb)
       on conflict (household_id, month) do update set agreements = excluded.agreements, to_cancel = excluded.to_cancel, updated_at = now()
       returning *`,
      [h, month, JSON.stringify(agreements), JSON.stringify(toCancel)],
    ),
  );

beforeAll(async () => {
  db = await createDb();
  [ana, bia, carlos] = await Promise.all(["ana", "bia", "carlos"].map((n) => addUser(db, `${n}@x.com`)));
  hA = await asUser(db, ana, async () => (await q("select public.create_household('A','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  await asUser(db, carlos, () => q("select public.create_household('B','Carlos')"));
});

describe("encontro do dinheiro", () => {
  it("o casal grava os combinados do mês; o par vê, edita e conclui; uma linha por mês", async () => {
    const [row] = await upsert(ana, hA, "2026-09-01", ["pedir menos iFood"], [{ key: "netflix", label: "Netflix", cents: 5590 }]);
    expect(row.created_by).toBe(ana);
    expect(row.completed_at).toBeNull();
    await upsert(bia, hA, "2026-09-01", ["pedir menos iFood", "levar marmita"]);
    await asUser(db, bia, () => q("update public.money_dates set completed_at = now(), completed_by = $1 where month = '2026-09-01'", [bia]));
    const rows = await asUser(db, ana, () => q("select agreements, completed_by from public.money_dates"));
    expect(rows).toEqual([{ agreements: ["pedir menos iFood", "levar marmita"], completed_by: bia }]);
    await upsert(ana, hA, "2026-10-01", []);
    expect(await asUser(db, bia, () => q("select to_char(month, 'YYYY-MM') as m from public.money_dates order by month desc"))).toEqual([{ m: "2026-10" }, { m: "2026-09" }]);
  });

  it("recusa mais de 3 combinados, textos vazios ou longos, mês fora do dia 1 e cancelamentos malformados", async () => {
    expect(await rejects(upsert(ana, hA, "2026-11-01", ["a", "b", "c", "d"]))).toBe(true);
    expect(await rejects(upsert(ana, hA, "2026-11-01", ["  "]))).toBe(true);
    expect(await rejects(upsert(ana, hA, "2026-11-01", ["x".repeat(81)]))).toBe(true);
    expect(await rejects(upsert(ana, hA, "2026-11-01", [1]))).toBe(true);
    expect(await rejects(upsert(ana, hA, "2026-11-01", { a: 1 }))).toBe(true);
    expect(await rejects(upsert(ana, hA, "2026-11-15", []))).toBe(true);
    expect(await rejects(upsert(ana, hA, "2026-11-01", [], [{ label: "sem chave" }]))).toBe(true);
    expect(await rejects(upsert(ana, hA, "2026-11-01", [], ["netflix"]))).toBe(true);
  });

  it("outro casal não vê, não altera e não grava no casal alheio; anônimo não vê", async () => {
    expect(await asUser(db, carlos, () => q("select * from public.money_dates"))).toEqual([]);
    expect((await asUser(db, carlos, () => db.query("update public.money_dates set agreements = '[]'::jsonb"))).affectedRows).toBe(0);
    expect((await asUser(db, carlos, () => db.query("delete from public.money_dates"))).affectedRows).toBe(0);
    expect(await rejects(upsert(carlos, hA, "2026-12-01", ["invadir"]))).toBe(true);
    const anon = await asAnon(db, () => q("select * from public.money_dates")).catch(() => []);
    expect(anon).toEqual([]);
  });

  it("apagar o usuário não apaga o histórico (autor vira null)", async () => {
    await q("delete from auth.users where id = $1", [bia]);
    const rows = await q("select completed_by from public.money_dates where month = '2026-09-01'");
    expect(rows).toEqual([{ completed_by: null }]);
  });
});
