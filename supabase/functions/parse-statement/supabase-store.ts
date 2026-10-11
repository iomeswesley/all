// Implementação do Store sobre o supabase-js, usando o JWT do usuário (a RLS vale; sem service role).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategorizeContext, Merchant, Rule } from "../_shared/core/categorize.ts";
import type { Store } from "./process.ts";

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export function supabaseStore(db: SupabaseClient): Store {
  return {
    async householdId() {
      const rows = check(await db.from("members").select("household_id").limit(1), "members");
      if (!rows?.length) throw new Error("Usuário não pertence a nenhum casal.");
      return rows[0]!.household_id as string;
    },
    async findStatementBySha(householdId, sha) {
      const rows = check(await db.from("statements").select("id,status").eq("household_id", householdId).eq("file_sha256", sha).limit(1), "statements");
      return rows?.[0] ?? null;
    },
    async findStatementByDue(householdId, accountId, dueDate) {
      const rows = check(await db.from("statements").select("id,status").eq("household_id", householdId).eq("account_id", accountId).eq("due_date", dueDate).limit(1), "statements");
      return rows?.[0] ?? null;
    },
    async deleteStatement(id) {
      check(await db.from("statements").delete().eq("id", id), "delete statement");
    },
    async account(householdId, accountId) {
      let q = db.from("accounts").select("id").eq("household_id", householdId).eq("kind", "credit_card").order("created_at").limit(1);
      if (accountId) q = db.from("accounts").select("id").eq("household_id", householdId).eq("id", accountId).limit(1);
      const rows = check(await q, "accounts");
      if (!rows?.length) throw new Error("Conta de cartão não encontrada.");
      return { id: rows[0]!.id as string };
    },
    async cardOwners(accountId) {
      const rows = check(await db.from("account_cards").select("last4,holder_user_id").eq("account_id", accountId), "account_cards") ?? [];
      return Object.fromEntries(rows.map((r) => [String(r.last4), (r.holder_user_id as string | null) ?? null]));
    },
    async categorizeContext(householdId): Promise<CategorizeContext> {
      const [rules, merchants] = await Promise.all([
        db.from("rules").select("pattern,match_type,category_id,owner_user_id,priority").eq("household_id", householdId),
        db.from("merchants").select("household_id,pattern,match_type,real_name,segment,category_id,confidence"),
      ]);
      const toMerchant = (m: Record<string, unknown>): Merchant => ({
        pattern: m.pattern as string,
        matchType: m.match_type as Merchant["matchType"],
        realName: m.real_name as string,
        segment: (m.segment as string | null) ?? null,
        categoryId: m.category_id as number,
        confidence: m.confidence as Merchant["confidence"],
      });
      const all = check(merchants, "merchants") ?? [];
      return {
        rules: (check(rules, "rules") ?? []).map(
          (r): Rule => ({
            pattern: r.pattern as string,
            matchType: r.match_type as Rule["matchType"],
            categoryId: (r.category_id as number | null) ?? null,
            ownerUserId: (r.owner_user_id as string | null) ?? null,
            priority: r.priority as number,
          }),
        ),
        householdMerchants: all.filter((m) => m.household_id !== null).map(toMerchant),
        globalMerchants: all.filter((m) => m.household_id === null).map(toMerchant),
      };
    },
    async insertStatement(row) {
      const res = await db.from("statements").insert(row).select("id").single();
      if (res.error) throw new Error(`insert statement: ${res.error.message}`);
      return (res.data as { id: string }).id;
    },
    async insertTransactions(rows) {
      for (let i = 0; i < rows.length; i += 200) {
        check(await db.from("transactions").insert(rows.slice(i, i + 200)), "insert transactions");
      }
    },
    async upsertCards(rows) {
      if (rows.length === 0) return;
      check(await db.from("account_cards").upsert(rows, { onConflict: "account_id,last4", ignoreDuplicates: true }), "account_cards");
    },
  };
}
