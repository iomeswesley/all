import { ruleFromCorrection, ruleMatchesDescription } from "@financas/core";
import type { CategoryChoice } from "@/components/CategorySheet";
import { fetchAll } from "./data";
import { applyCategory, applyToIds, setPrivate } from "./mutations";
import { supabase } from "./supabase";

/** Estado de um lançamento antes da correção (para desfazer). */
interface TxSnapshot {
  id: string;
  category_id: number | null;
  category_source: string;
  confidence: string;
  needs_review: boolean;
  owner_user_id: string | null;
  is_private: boolean;
}

export interface UndoToken {
  rows: TxSnapshot[];
  /** regra gravada pela correção; `previous` = como ela estava antes (null = não existia) */
  rule: { pattern: string; matchType: string; previous: { category_id: number | null; owner_user_id: string | null } | null } | null;
}

const SNAP_COLS = "id, description_raw, category_id, category_source, confidence, needs_review, owner_user_id, is_private";
type SnapRow = TxSnapshot & { description_raw: string };

/**
 * Aplica a categoria aos lançamentos do cartão (reaproveitando lib/mutations) e devolve o que é preciso
 * para desfazer: o estado anterior dos lançamentos tocados e da regra.
 */
export async function applyWithUndo(opts: { description: string; ids: readonly string[]; choice: CategoryChoice; meUserId: string }): Promise<UndoToken> {
  const { description, ids, choice } = opts;
  let rows: SnapRow[];
  let rule: UndoToken["rule"] = null;

  if (choice.always) {
    const r = ruleFromCorrection(description, choice.categoryId);
    const [all, existing] = await Promise.all([
      fetchAll<SnapRow>((from, to) =>
        supabase.from("transactions").select(SNAP_COLS).neq("kind", "pagamento").range(from, to) as unknown as PromiseLike<{ data: SnapRow[] | null; error: { message: string } | null }>,
      ),
      supabase.from("rules").select("category_id, owner_user_id").eq("pattern", r.pattern.trim()).eq("match_type", r.matchType).maybeSingle(),
    ]);
    rows = all.filter((t) => ids.includes(t.id) || ruleMatchesDescription(r, t.description_raw));
    rule = { pattern: r.pattern.trim(), matchType: r.matchType, previous: existing.data ? { category_id: existing.data.category_id as number | null, owner_user_id: existing.data.owner_user_id as string | null } : null };
    await applyCategory({ description, txId: ids[0]!, categoryId: choice.categoryId, ownerUserId: choice.ownerUserId, always: true });
    // itens do cartão que o padrão da regra não alcança (raro) recebem a categoria direto
    const loose = ids.filter((id) => !rows.some((t) => t.id === id && ruleMatchesDescription(r, t.description_raw)) && id !== ids[0]);
    if (loose.length) await applyToIds(loose, choice.categoryId, choice.ownerUserId);
  } else {
    const { data, error } = await supabase.from("transactions").select(SNAP_COLS).in("id", [...ids]);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as SnapRow[];
    await applyToIds(ids, choice.categoryId, choice.ownerUserId);
  }
  if (choice.isPrivate) await setPrivate(ids, opts.meUserId, true);

  return { rows: rows.map(({ description_raw: _d, ...s }) => s), rule };
}

/** Volta os lançamentos e a regra ao estado de antes. */
export async function undoApply(token: UndoToken): Promise<void> {
  if (token.rule) {
    const q = supabase.from("rules");
    const { error } = token.rule.previous
      ? await q.update(token.rule.previous).eq("pattern", token.rule.pattern).eq("match_type", token.rule.matchType)
      : await q.delete().eq("pattern", token.rule.pattern).eq("match_type", token.rule.matchType);
    if (error) throw new Error(error.message);
  }
  // agrupa por estado igual para gravar em lote
  const groups = new Map<string, string[]>();
  for (const { id, ...state } of token.rows) {
    const k = JSON.stringify(state);
    groups.set(k, [...(groups.get(k) ?? []), id]);
  }
  for (const [k, ids] of groups) {
    const patch = JSON.parse(k) as Omit<TxSnapshot, "id">;
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from("transactions").update(patch).in("id", ids.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }
  }
}
