import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsTx, BudgetRow, HiddenTotal } from "../_shared/core/index.ts";
import type { NotifyStore } from "./process.ts";

function ok<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export function notifySupabaseStore(db: SupabaseClient, userId: string): NotifyStore {
  let householdId: string | null = null;
  const hid = async () => {
    if (householdId) return householdId;
    const rows = ok(await db.from("members").select("household_id").eq("user_id", userId).limit(1), "members");
    if (!rows?.length) throw new Error("Usuário sem casal.");
    return (householdId = rows[0]!.household_id as string);
  };
  return {
    async me() {
      const rows = ok(await db.from("members").select("household_id, display_name").eq("user_id", userId).limit(1), "members");
      const row = rows?.[0];
      if (!row) throw new Error("Usuário sem casal.");
      householdId = row.household_id as string;
      return { userId, householdId, displayName: row.display_name as string };
    },
    async statement(id) {
      const rows = ok(await db.from("statements").select("id, status, due_date").eq("id", id).limit(1), "statements");
      const r = rows?.[0];
      return r ? { id: r.id as string, status: r.status as string, dueDate: r.due_date as string } : null;
    },
    async monthTransactions(month) {
      const out: AnalyticsTx[] = [];
      for (let from = 0; ; from += 1000) {
        const rows = ok(
          await db.from("v_transactions").select("statement_month, posted_on, description_raw, merchant_name, amount_cents, category_id, kind, owner_user_id").eq("statement_month", month).order("id").range(from, from + 999),
          "v_transactions",
        ) ?? [];
        for (const r of rows) {
          out.push({
            statementMonth: r.statement_month as string, postedOn: r.posted_on as string, descriptionRaw: r.description_raw as string,
            merchantName: (r.merchant_name as string | null) ?? null, amountCents: Number(r.amount_cents), categoryId: (r.category_id as number | null) ?? null,
            kind: r.kind as AnalyticsTx["kind"], ownerUserId: (r.owner_user_id as string | null) ?? null,
          });
        }
        if (rows.length < 1000) return out;
      }
    },
    async hiddenTotals() {
      const rows = ok(await db.rpc("partner_private_totals"), "partner_private_totals") as Record<string, unknown>[] | null;
      return (rows ?? []).map((r): HiddenTotal => ({
        statementMonth: r.statement_month as string, categoryId: (r.category_id as number | null) ?? null,
        ownerUserId: r.owner_user_id as string, totalCents: Number(r.total_cents), count: Number(r.n),
      }));
    },
    async memberNames() {
      const rows = ok(await db.from("members").select("user_id, display_name"), "members") ?? [];
      return Object.fromEntries(rows.map((r) => [r.user_id as string, r.display_name as string]));
    },
    async budgetRows() {
      const rows = ok(await db.from("budgets").select("category_id, month, limit_cents"), "budgets") ?? [];
      return rows.map((r): BudgetRow => ({ categoryId: r.category_id as number, month: (r.month as string).slice(0, 7), limitCents: Number(r.limit_cents) }));
    },
    async sentAlerts(month) {
      const rows = ok(await db.from("budget_alerts").select("category_id, month, level").eq("month", `${month}-01`), "budget_alerts") ?? [];
      return new Set(rows.map((r) => `${month}|${r.category_id}|${r.level}`));
    },
    async markAlerts(alerts) {
      const household = await hid();
      ok(
        await db.from("budget_alerts").upsert(
          alerts.map((a) => ({ household_id: household, category_id: a.categoryId, month: `${a.month}-01`, level: a.level })),
          { onConflict: "household_id,category_id,month,level", ignoreDuplicates: true },
        ),
        "budget_alerts",
      );
    },
    async pushTokens() {
      const rows = ok(await db.from("push_tokens").select("user_id, token"), "push_tokens") ?? [];
      return rows.map((r) => ({ userId: r.user_id as string, token: r.token as string }));
    },
    async transaction(id) {
      const rows = ok(await db.from("transactions").select("id, posted_on, description_clean, amount_cents, category_id, needs_review, is_private, source").eq("id", id).limit(1), "transactions");
      const r = rows?.[0];
      return r
        ? { id: r.id as string, postedOn: r.posted_on as string, descriptionClean: r.description_clean as string, amountCents: Number(r.amount_cents), categoryId: (r.category_id as number | null) ?? null, needsReview: Boolean(r.needs_review), isPrivate: Boolean(r.is_private), source: r.source as string }
        : null;
    },
    async statementCounts(statementId) {
      const rows = ok(await db.from("transactions").select("needs_review").eq("statement_id", statementId), "transactions") ?? [];
      return { count: rows.length, reviewCount: rows.filter((r) => r.needs_review).length };
    },
  };
}
