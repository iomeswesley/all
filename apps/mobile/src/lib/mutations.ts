import { reconcile, reconcileGeneric, ruleFromCorrection, ruleMatchesDescription, type DeclaredTotals, type HiddenSums, type ReconcileResult, type ReconTx, type Rule } from "@financas/core";
import { fetchAll } from "./data";
import { supabase } from "./supabase";
import type { StatementRow } from "./data";

export function declaredOf(s: StatementRow): DeclaredTotals {
  return {
    totalDueCents: Number(s.declared_total_cents),
    previousBalanceCents: s.declared_previous_balance_cents === null ? null : Number(s.declared_previous_balance_cents),
    expensesCents: Number(s.declared_expenses_cents ?? 0),
    expensesUsdCents: s.declared_expenses_usd_cents === null ? null : Number(s.declared_expenses_usd_cents),
    paymentsCents: Number(s.declared_payments_cents ?? 0),
    creditsCents: Number(s.declared_credits_cents ?? 0),
    futureObligationsCents: s.declared_future_cents === null ? null : Number(s.declared_future_cents),
  };
}

export interface TxFull extends ReconTx {
  id: string;
  posted_on: string;
  description_raw: string;
  description_clean: string;
  category_id: number | null;
  needs_review: boolean;
  owner_user_id: string | null;
  card_last4: string | null;
  fx_rate: number | null;
  is_private: boolean;
}

export const TX_FULL_COLUMNS =
  "id, posted_on, description_raw, description_clean, amount_cents, amount_usd_cents, kind, section, installment_n, installment_total, category_id, needs_review, owner_user_id, card_last4, fx_rate, is_private";

type Raw = Record<string, unknown>;
export const toTxFull = (r: Raw): TxFull => ({
  id: r.id as string,
  posted_on: r.posted_on as string,
  description_raw: r.description_raw as string,
  description_clean: r.description_clean as string,
  amountCents: Number(r.amount_cents),
  amountUsdCents: r.amount_usd_cents === null ? null : Number(r.amount_usd_cents),
  kind: r.kind as TxFull["kind"],
  section: (r.section as TxFull["section"]) ?? "despesas",
  installmentN: (r.installment_n as number | null) ?? null,
  installmentTotal: (r.installment_total as number | null) ?? null,
  category_id: (r.category_id as number | null) ?? null,
  needs_review: Boolean(r.needs_review),
  owner_user_id: (r.owner_user_id as string | null) ?? null,
  card_last4: (r.card_last4 as string | null) ?? null,
  fx_rate: r.fx_rate === null ? null : Number(r.fx_rate),
  is_private: Boolean(r.is_private),
});

/** Recalcula a conferência com os lançamentos atuais e grava no resumo da fatura. */
export async function fetchHiddenSums(statementId: string): Promise<HiddenSums> {
  const { data, error } = await supabase.rpc("statement_hidden_sums", { p_statement_id: statementId });
  if (error) throw new Error(error.message);
  const r = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  return {
    expensesCents: Number(r.expenses_cents ?? 0),
    expensesUsdCents: Number(r.expenses_usd_cents ?? 0),
    futureCents: Number(r.future_cents ?? 0),
    remainingInstallments: Number(r.remaining_installments ?? 0),
  };
}

/** Conferência pelo formato de origem: fatura Santander tem resumo completo; OFX/JSON só um total (ou nenhum). */
export function reconcileStatement(statement: StatementRow, txs: readonly ReconTx[], hidden?: HiddenSums): ReconcileResult {
  if (statement.format !== "santander_pdf") {
    const declared = statement.declared_expenses_cents === null ? null : Number(statement.declared_expenses_cents);
    // gasto pessoal do par que não enxergamos entra como uma linha "avista" só para a soma
    const extra: ReconTx[] = hidden && hidden.expensesCents !== 0 ? [{ amountCents: hidden.expensesCents, amountUsdCents: null, kind: "avista", section: "despesas", installmentN: null, installmentTotal: null }] : [];
    return reconcileGeneric(declared, [...txs, ...extra]);
  }
  return reconcile(declaredOf(statement), txs, hidden);
}

export async function refreshReconciliation(statement: StatementRow, txs: readonly TxFull[]) {
  const result = reconcileStatement(statement, txs, await fetchHiddenSums(statement.id));
  const { error } = await supabase
    .from("statements")
    .update({
      computed_total_cents: result.computedTotalCents,
      computed_future_cents: result.computedFutureCents,
      reconcile_status: result.status,
      reconcile_checks: result.checks,
    })
    .eq("id", statement.id);
  if (error) throw new Error(error.message);
  return result;
}

export async function confirmStatement(id: string, force: boolean) {
  const { error } = await supabase.rpc("confirm_statement", { p_statement_id: id, p_force: force });
  if (error) throw new Error(error.message);
}

export async function discardStatement(statement: Pick<StatementRow, "id" | "file_path">) {
  const { error } = await supabase.from("statements").delete().eq("id", statement.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from("statements").remove([statement.file_path]);
}

/**
 * Correção manual → vale para os dois.
 * Cria uma regra (padrão do estabelecimento) e aplica a todos os lançamentos do casal que casam com ela.
 * Sem "sempre", muda só o lançamento escolhido.
 */
export async function applyCategory(opts: {
  description: string;
  txId: string;
  categoryId: number;
  ownerUserId: string | null | undefined;
  always: boolean;
}): Promise<number> {
  if (!opts.always) {
    const patch: Record<string, unknown> = { category_id: opts.categoryId, category_source: "manual", confidence: "alta", needs_review: false };
    if (opts.ownerUserId !== undefined) patch.owner_user_id = opts.ownerUserId;
    const { error } = await supabase.from("transactions").update(patch).eq("id", opts.txId);
    if (error) throw new Error(error.message);
    return 1;
  }
  const rule = ruleFromCorrection(opts.description, opts.categoryId, opts.ownerUserId ?? null);
  const all = await fetchAll<{ id: string; description_raw: string }>((from, to) =>
    supabase.from("transactions").select("id, description_raw").neq("kind", "pagamento").range(from, to) as unknown as PromiseLike<{ data: { id: string; description_raw: string }[] | null; error: { message: string } | null }>,
  );
  const ids = all.filter((t) => matchesRule(t.description_raw, rule)).map((t) => t.id);
  if (!ids.includes(opts.txId)) ids.push(opts.txId);
  const { data, error } = await supabase.rpc("save_rule_and_apply", {
    p_pattern: rule.pattern,
    p_match_type: rule.matchType,
    p_category_id: opts.categoryId,
    p_owner_user_id: opts.ownerUserId ?? null,
    p_tx_ids: ids,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? ids.length);
}

const matchesRule = (rawDescription: string, rule: Pick<Rule, "pattern" | "matchType">) => ruleMatchesDescription(rule, rawDescription);

/** Quantos lançamentos a regra afetaria (para a legenda "Sempre que aparecer"). */
export function countMatches(descriptions: readonly string[], description: string): number {
  const rule = ruleFromCorrection(description, 0);
  return descriptions.filter((d) => matchesRule(d, rule)).length;
}

/** Aplica a categoria (e dono, se informado) só aos lançamentos indicados, sem criar regra. */
export async function applyToIds(ids: readonly string[], categoryId: number, ownerUserId: string | null | undefined) {
  const patch: Record<string, unknown> = { category_id: categoryId, category_source: "manual", confidence: "alta", needs_review: false };
  if (ownerUserId !== undefined) patch.owner_user_id = ownerUserId;
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from("transactions").update(patch).in("id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

/** Gasto pessoal: só o dono vê os itens; o par vê apenas o total da categoria. */
export async function setPrivate(ids: readonly string[], ownerUserId: string, isPrivate: boolean) {
  for (let i = 0; i < ids.length; i += 100) {
    const patch = isPrivate ? { is_private: true, owner_user_id: ownerUserId } : { is_private: false };
    const { error } = await supabase.from("transactions").update(patch).in("id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

export { notifyStatement as notifyConfirmed } from "./notify";
export type { NotifyResponse } from "./notify";

export async function saveBudget(householdId: string, categoryId: number, month: string, limitCents: number) {
  const { error } = await supabase
    .from("budgets")
    .upsert({ household_id: householdId, category_id: categoryId, month: `${month}-01`, limit_cents: limitCents }, { onConflict: "household_id,category_id,month" });
  if (error) throw new Error(error.message);
}
