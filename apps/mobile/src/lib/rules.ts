import { categorize, ruleMatchesDescription, type MatchType } from "@financas/core";
import { fetchAll } from "./data";
import { supabase } from "./supabase";

export interface RuleRow {
  id: string;
  pattern: string;
  matchType: MatchType;
  categoryId: number | null;
  ownerUserId: string | null;
  createdAt: string;
}

export async function fetchRules(): Promise<RuleRow[]> {
  const { data, error } = await supabase.from("rules").select("id, pattern, match_type, category_id, owner_user_id, created_at").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    pattern: r.pattern as string,
    matchType: r.match_type as MatchType,
    categoryId: (r.category_id as number | null) ?? null,
    ownerUserId: (r.owner_user_id as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

interface TxLite {
  id: string;
  description_raw: string;
  kind: string;
  category_source: string;
}

/** Descrições de todos os lançamentos (leve), para contar e aplicar regras. */
export async function fetchTxLite(): Promise<TxLite[]> {
  return fetchAll<TxLite>((from, to) =>
    supabase.from("transactions").select("id, description_raw, kind, category_source").neq("kind", "pagamento").order("id").range(from, to) as unknown as PromiseLike<{ data: TxLite[] | null; error: { message: string } | null }>,
  );
}

export const countRuleMatches = (txs: readonly TxLite[], rule: Pick<RuleRow, "pattern" | "matchType">) => txs.filter((t) => ruleMatchesDescription(rule, t.description_raw)).length;

export async function updateRule(id: string, patch: { pattern: string; matchType: MatchType; categoryId: number | null; ownerUserId: string | null }) {
  const { error } = await supabase
    .from("rules")
    .update({ pattern: patch.pattern.trim(), match_type: patch.matchType, category_id: patch.categoryId, owner_user_id: patch.ownerUserId })
    .eq("id", id);
  if (error) throw new Error(error.message.includes("duplicate") ? "Já existe uma regra igual." : error.message);
}

/** Aplica a regra (categoria e dono) a todos os lançamentos que ela casa. Devolve quantos mudaram. */
export async function applyRuleToExisting(rule: Pick<RuleRow, "pattern" | "matchType" | "categoryId" | "ownerUserId">): Promise<number> {
  if (rule.categoryId === null) return 0;
  const ids = (await fetchTxLite()).filter((t) => ruleMatchesDescription(rule, t.description_raw)).map((t) => t.id);
  if (ids.length === 0) return 0;
  const { data, error } = await supabase.rpc("save_rule_and_apply", {
    p_pattern: rule.pattern.trim(),
    p_match_type: rule.matchType,
    p_category_id: rule.categoryId,
    p_owner_user_id: rule.ownerUserId,
    p_tx_ids: ids,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? ids.length);
}

/**
 * Apaga a regra. Com `recategorize`, os lançamentos que foram classificados POR ELA são reclassificados
 * pelo dicionário/outras regras (ou voltam para Revisar). Correções manuais nunca são tocadas.
 */
export async function deleteRule(rule: RuleRow, opts: { recategorize: boolean }): Promise<number> {
  let changed = 0;
  if (opts.recategorize) {
    const [remainingRules, txs] = await Promise.all([fetchRules(), fetchTxLite()]);
    const others = remainingRules.filter((r) => r.id !== rule.id).map((r) => ({ pattern: r.pattern, matchType: r.matchType, categoryId: r.categoryId, ownerUserId: r.ownerUserId }));
    const affected = txs.filter((t) => t.category_source === "rule" && ruleMatchesDescription(rule, t.description_raw));
    for (const t of affected) {
      const c = categorize({ description: t.description_raw, kind: t.kind as "avista" }, { rules: others });
      const { error } = await supabase
        .from("transactions")
        .update({ category_id: c.categoryId, category_source: c.source, confidence: c.confidence, needs_review: c.needsReview })
        .eq("id", t.id);
      if (error) throw new Error(error.message);
      changed++;
    }
  }
  const { error } = await supabase.from("rules").delete().eq("id", rule.id);
  if (error) throw new Error(error.message);
  return changed;
}
