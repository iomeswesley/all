import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { notifyStatementConfirmed, type NotifyStore, type PushSender } from "../../../supabase/functions/notify/process.ts";
import { processStatement } from "../../../supabase/functions/parse-statement/process.ts";
import { addUser, asUser, createDb } from "./harness.ts";
import { sqlStore } from "./sql-store.ts";

const fixtures = path.resolve(import.meta.dirname, "../../../fixtures/santander");
const items = (m: string) => JSON.parse(fs.readFileSync(path.join(fixtures, `${m}.items.json`), "utf8"));

let db: PGlite;
let ana: string, bia: string, household: string, statementId: string;
const TOKEN_ANA = "ExponentPushToken[aaaaaaaaaaaaaaaa]";
const TOKEN_BIA = "ExponentPushToken[bbbbbbbbbbbbbbbb]";

/** NotifyStore em SQL puro, como o usuário (RLS valendo). */
function notifyStore(user: string): NotifyStore {
  const run = <T = any>(sql: string, params: unknown[] = []) => asUser(db, user, async () => (await db.query<T>(sql, params)).rows);
  return {
    me: async () => (await run("select user_id as \"userId\", household_id as \"householdId\", display_name as \"displayName\" from public.members where user_id = $1", [user]))[0],
    statement: async (id) => (await run("select id, status, to_char(due_date,'YYYY-MM-DD') as \"dueDate\" from public.statements where id = $1", [id]))[0] ?? null,
    monthTransactions: async (m) => (await run("select statement_month as \"statementMonth\", to_char(posted_on,'YYYY-MM-DD') as \"postedOn\", description_raw as \"descriptionRaw\", merchant_name as \"merchantName\", amount_cents::int as \"amountCents\", category_id as \"categoryId\", kind, owner_user_id as \"ownerUserId\" from public.v_transactions where statement_month = $1", [m])),
    hiddenTotals: async () => (await run("select statement_month as \"statementMonth\", category_id as \"categoryId\", owner_user_id as \"ownerUserId\", total_cents::int as \"totalCents\", n as count from public.partner_private_totals()")),
    memberNames: async () => Object.fromEntries((await run("select user_id, display_name from public.members")).map((r: any) => [r.user_id, r.display_name])),
    budgetRows: async () => (await run("select category_id as \"categoryId\", to_char(month,'YYYY-MM') as month, limit_cents::int as \"limitCents\" from public.budgets")),
    sentAlerts: async (m) => new Set((await run("select category_id, level from public.budget_alerts where month = $1", [`${m}-01`])).map((r: any) => `${m}|${r.category_id}|${r.level}`)),
    markAlerts: async (alerts) => { for (const a of alerts) await run("insert into public.budget_alerts (household_id, category_id, month, level) values ((select household_id from public.members where user_id = $1), $2, $3, $4) on conflict do nothing", [user, a.categoryId, `${a.month}-01`, a.level]); },
    pushTokens: async () => (await run("select user_id as \"userId\", token from public.push_tokens")),
    statementCounts: async (id) => { const r = (await run("select count(*)::int as c, count(*) filter (where needs_review)::int as r from public.transactions where statement_id = $1", [id]))[0]; return { count: r.c, reviewCount: r.r }; },
  };
}

function fakeSender() {
  const sent: { to: string; title: string; body: string; data: any }[] = [];
  const sender: PushSender = { send: async (m) => { sent.push(...m); } };
  return { sent, sender };
}

const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeAll(async () => {
  db = await createDb();
  ana = await addUser(db, "ana@x.com");
  bia = await addUser(db, "bia@x.com");
  household = await asUser(db, ana, async () => (await q("select public.create_household('Casal','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  await asUser(db, ana, () => q("insert into public.push_tokens (user_id, household_id, token) values ($1,$2,$3)", [ana, household, TOKEN_ANA]));
  await asUser(db, bia, () => q("insert into public.push_tokens (user_id, household_id, token) values ($1,$2,$3)", [bia, household, TOKEN_BIA]));
  const r = await processStatement(sqlStore(db, ana), { items: items("2026-09"), sha256: "s", filePath: `${household}/a.pdf`, userId: ana });
  if (r.status !== "ok") throw new Error("import falhou");
  statementId = r.statementId;
});

describe("notify: fatura ainda não confirmada", () => {
  it("não avisa nada", async () => {
    const { sent, sender } = fakeSender();
    expect(await notifyStatementConfirmed(notifyStore(ana), sender, statementId)).toEqual({ status: "not_confirmed" });
    expect(sent).toEqual([]);
  });
  it("fatura inexistente ou de outro casal → not_found", async () => {
    const { sender } = fakeSender();
    expect(await notifyStatementConfirmed(notifyStore(ana), sender, "00000000-0000-0000-0000-000000000000")).toEqual({ status: "not_found" });
  });
});

describe("notify: depois de confirmar", () => {
  let catId: number, totalAll: number, totalVisibleToAna: number;

  beforeAll(async () => {
    // Bia marca como gasto pessoal as 3 maiores compras da categoria mais gasta
    const [top] = await q("select category_id, sum(amount_cents)::int as s from public.transactions where statement_id = $1 and section <> 'pagamentos' and category_id is not null and category_id <> 12 group by 1 order by 2 desc limit 1", [statementId]);
    catId = top.category_id;
    const ids = (await q("select id from public.transactions where statement_id = $1 and category_id = $2 and kind = 'avista' order by amount_cents desc limit 3", [statementId, catId])).map((r: any) => r.id);
    await asUser(db, bia, () => q("update public.transactions set is_private = true, owner_user_id = $1 where id = any($2::uuid[])", [bia, ids]));
    await asUser(db, ana, () => q("select public.confirm_statement($1)", [statementId]));
    totalAll = (await q("select sum(amount_cents)::int as s from public.transactions where statement_id = $1 and category_id = $2", [statementId, catId]))[0].s;
    totalVisibleToAna = (await asUser(db, ana, () => q("select sum(amount_cents)::int as s from public.v_transactions where statement_id = $1 and category_id = $2", [statementId, catId])))[0].s;
    expect(totalVisibleToAna).toBeLessThan(totalAll);
    // orçamento = exatamente o total real: só estoura se o gasto pessoal da Bia contar
    await asUser(db, ana, () => q("insert into public.budgets (household_id, category_id, month, limit_cents) values ($1,$2,'2026-09-01',$3)", [household, catId, totalAll]));
  });

  it("o gasto pessoal do par entra no orçamento (só como total) e os dois recebem o alerta", async () => {
    const { sent, sender } = fakeSender();
    const res = await notifyStatementConfirmed(notifyStore(ana), sender, statementId);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.month).toBe("2026-09");
    expect(res.alerts).toHaveLength(1);
    expect(res.alerts[0]).toMatchObject({ categoryId: catId, level: "over100", percent: 100 });
    const budgetPushes = sent.filter((m) => m.data.type === "budget");
    expect(budgetPushes.map((m) => m.to).sort()).toEqual([TOKEN_ANA, TOKEN_BIA].sort());
    // nada do que foi enviado expõe item do gasto pessoal
    expect(JSON.stringify(sent)).not.toMatch(/SURPRESA|ESTAB|RESTAURANTE \d/i);
  });

  it("só o par recebe o aviso de fatura confirmada, com a contagem de lançamentos", async () => {
    const { sent, sender } = fakeSender();
    await notifyStatementConfirmed(notifyStore(ana), sender, statementId);
    const imports = sent.filter((m) => m.data.type === "import");
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({ to: TOKEN_BIA, title: "Ana confirmou a fatura de set/26" });
    expect(imports[0]!.body).toMatch(/^\d+ lançamentos\./);
  });

  it("o mesmo alerta não é enviado de novo (idempotente por categoria/mês/nível)", async () => {
    const { sent, sender } = fakeSender();
    const res = await notifyStatementConfirmed(notifyStore(bia), sender, statementId);
    expect(res.status === "ok" && res.alerts).toEqual([]);
    expect(sent.filter((m) => m.data.type === "budget")).toEqual([]);
    expect((await q("select * from public.budget_alerts")).length).toBe(1);
  });

  it("sem tokens (Expo Go) o app ainda recebe os alertas para mostrar dentro dele", async () => {
    await q("delete from public.push_tokens");
    await q("delete from public.budget_alerts");
    const { sent, sender } = fakeSender();
    const res = await notifyStatementConfirmed(notifyStore(ana), sender, statementId);
    expect(sent).toEqual([]);
    expect(res.status === "ok" && res.alerts.length).toBe(1);
    expect(res.status === "ok" && res.pushSent).toBe(0);
  });

  it("80%: aviso intermediário quando o gasto está entre 80% e 100%", async () => {
    await q("delete from public.budget_alerts");
    await q("update public.budgets set limit_cents = $1", [Math.ceil(totalAll / 0.9)]); // gasto = 90% do limite
    const { sender } = fakeSender();
    const res = await notifyStatementConfirmed(notifyStore(ana), sender, statementId);
    expect(res.status === "ok" && res.alerts.map((a) => a.level)).toEqual(["warn80"]);
  });
});
