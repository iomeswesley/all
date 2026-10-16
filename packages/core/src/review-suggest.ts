import { CAT } from "./categories.ts";
import { categorize, type Rule } from "./categorize.ts";
import { merchantKey } from "./normalize.ts";
import type { TxKind } from "./parsers/types.ts";

/** De onde veio a sugestão da revisão por cartões. */
export type ReviewSuggestionSource = "regra" | "historico" | "dicionario" | "frequente";

export interface ReviewSuggestion {
  categoryId: number;
  source: ReviewSuggestionSource;
}

export const REVIEW_SOURCE_LABEL: Record<ReviewSuggestionSource, string> = {
  regra: "Pela regra do casal",
  historico: "Como das outras vezes",
  dicionario: "Pelo dicionário",
  frequente: "A mais usada",
};

/** Contagem de categorias já revisadas por estabelecimento (chave = merchantKey). */
export type MerchantHistory = ReadonlyMap<string, ReadonlyMap<number, number>>;

export function merchantHistory(rows: readonly { description: string; categoryId: number | null }[]): MerchantHistory {
  const out = new Map<string, Map<number, number>>();
  for (const r of rows) {
    if (r.categoryId === null || r.categoryId === CAT.OUTROS) continue;
    const key = merchantKey(r.description);
    const m = out.get(key) ?? new Map<number, number>();
    m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1);
    out.set(key, m);
  }
  return out;
}

/** Categoria mais frequente; empate → menor id (determinístico). */
function mostFrequent(counts: ReadonlyMap<number, number> | undefined): number | null {
  if (!counts) return null;
  let best: number | null = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN || (n === bestN && best !== null && id < best)) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

const useful = (id: number | null | undefined): id is number => id !== null && id !== undefined && id !== CAT.OUTROS;

/**
 * Sugestão para um lançamento da fila Revisar (deslizar para a direita aceita).
 * Ordem: regra do casal → o que o casal já escolheu para o estabelecimento → categoria atual vinda do
 * dicionário (confiança baixa) → dicionário/heurística → a categoria mais usada. Nunca sugere "Outros".
 */
export function suggestReviewCategory(
  tx: { description: string; kind?: TxKind; categoryId?: number | null },
  ctx: { rules?: readonly Rule[]; history?: MerchantHistory; top?: readonly number[] } = {},
): ReviewSuggestion | null {
  const kind: TxKind = tx.kind ?? "avista";
  if (kind === "pagamento") return null;

  if (ctx.rules?.length) {
    const r = categorize({ description: tx.description, kind }, { rules: ctx.rules });
    if (r.source === "rule" && useful(r.categoryId)) return { categoryId: r.categoryId, source: "regra" };
  }
  const hist = mostFrequent(ctx.history?.get(merchantKey(tx.description)));
  if (useful(hist)) return { categoryId: hist, source: "historico" };
  if (useful(tx.categoryId)) return { categoryId: tx.categoryId, source: "dicionario" };
  const dict = categorize({ description: tx.description, kind }, {});
  if (dict.source !== "none" && useful(dict.categoryId)) return { categoryId: dict.categoryId, source: "dicionario" };
  const top = ctx.top?.find(useful);
  return top === undefined ? null : { categoryId: top, source: "frequente" };
}
