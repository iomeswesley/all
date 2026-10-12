import { buildManualRow, type CategorizeContext, type ManualEntryInput, type Merchant, type Rule } from "@financas/core";
import { randomUUID } from "expo-crypto";
import { toTxRow, type TxRow } from "./data";
import { supabase } from "./supabase";
import { notifyTx, type NotifyResponse } from "./notify";

async function categorizeContext(): Promise<CategorizeContext> {
  const [rules, merchants] = await Promise.all([
    supabase.from("rules").select("pattern, match_type, category_id, owner_user_id, priority"),
    supabase.from("merchants").select("household_id, pattern, match_type, real_name, segment, category_id, confidence"),
  ]);
  const toMerchant = (m: Record<string, unknown>): Merchant => ({
    pattern: m.pattern as string, matchType: m.match_type as Merchant["matchType"], realName: m.real_name as string,
    segment: (m.segment as string | null) ?? null, categoryId: m.category_id as number, confidence: m.confidence as Merchant["confidence"],
  });
  const all = merchants.data ?? [];
  return {
    rules: (rules.data ?? []).map((r): Rule => ({ pattern: r.pattern as string, matchType: r.match_type as Rule["matchType"], categoryId: (r.category_id as number | null) ?? null, ownerUserId: (r.owner_user_id as string | null) ?? null, priority: r.priority as number })),
    householdMerchants: all.filter((m) => m.household_id !== null).map(toMerchant),
    globalMerchants: all.filter((m) => m.household_id === null).map(toMerchant),
  };
}

export interface ManualResult {
  id: string;
  needsReview: boolean;
  notify: NotifyResponse | null;
}

/** Lança um gasto fora do cartão (Pix, dinheiro…), aplica as regras do casal e avisa o orçamento/par. */
export async function addManualEntry(householdId: string, input: ManualEntryInput): Promise<ManualResult> {
  const acc = await supabase.rpc("ensure_cash_account");
  if (acc.error || typeof acc.data !== "string") throw new Error("Não consegui preparar a conta Pix e dinheiro.");
  const row = buildManualRow(input, randomUUID(), await categorizeContext());
  const { data, error } = await supabase.from("transactions").insert({ ...row, household_id: householdId, account_id: acc.data }).select("id").single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  return { id, needsReview: row.needs_review, notify: await notifyTx(id) };
}

export async function fetchManualEntries(): Promise<TxRow[]> {
  const { data, error } = await supabase
    .from("v_transactions")
    .select("id, statement_id, statement_month, posted_on, description_raw, description_clean, merchant_name, amount_cents, amount_usd_cents, category_id, kind, owner_user_id, is_private, installment_n, installment_total, needs_review, card_last4, fx_rate, tax_deductible, tax_kind, attachment_path")
    .eq("source", "manual")
    .order("posted_on", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toTxRow(r as never));
}

export async function deleteManualEntry(id: string) {
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("source", "manual");
  if (error) throw new Error(error.message);
}
