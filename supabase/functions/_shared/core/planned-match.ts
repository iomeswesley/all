// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { addDays, addMonthsToKey, diffDays, monthKey, type IsoDate } from "./dates.ts";
import { matchKey } from "./normalize.ts";
import type { TxKind } from "./parsers/types.ts";
import { occurrencesBetween, type PlannedExpense, type PlannedOccurrence } from "./planned.ts";

/**
 * "Já aconteceu?": acha no realizado o lançamento que corresponde a um gasto planejado,
 * para o casal dar baixa (✓) ou dizer que não é (✕).
 *
 * Regras (determinísticas, sem IA):
 * - valor igual ou dentro de ±10% do planejado (fora disso não é candidato);
 * - data da compra até ±10 dias da data planejada; no cartão também vale a competência
 *   (fatura do mês planejado ou do mês seguinte), com pontuação menor;
 * - descrição parecida (tokens normalizados em comum) é bônus, nunca obrigatória.
 */
export type MatchConfidence = "alta" | "media" | "baixa";
export type PlannedMatchStatus = "feito" | "ignorado";

export interface MatchTx {
  id: string;
  postedOn: IsoDate;
  /** competência ("AAAA-MM") */
  statementMonth: string;
  descriptionRaw: string;
  merchantName?: string | null;
  amountCents: number;
  kind: TxKind;
  /** veio de fatura de cartão (a competência vale como janela extra) */
  card: boolean;
  hiddenAggregate?: boolean;
}

/** Baixa registrada pelo casal. */
export interface PlannedMark {
  plannedId: string;
  occurrenceDate: IsoDate;
  transactionId: string | null;
  status: PlannedMatchStatus;
}

export interface PlannedMatchSuggestion {
  occurrence: PlannedOccurrence;
  tx: MatchTx;
  /** 0–100 */
  score: number;
  confidence: MatchConfidence;
  /** outro lançamento ficou quase empatado: vale conferir */
  ambiguous: boolean;
}

export const MATCH_AMOUNT_TOLERANCE = 0.1;
export const MATCH_DATE_WINDOW_DAYS = 10;
/** quanto para trás procurar ocorrências sem baixa */
export const MATCH_LOOKBACK_DAYS = 60;
const MIN_SCORE = 40;
const AMBIGUOUS_GAP = 8;

const STOP = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "EM", "PARA", "COM", "LTDA", "PIX", "PAG", "COMPRA", "PARC", "PARCELA"]);

/** Tokens comparáveis: sem acento, maiúsculas, só letras/números, sem palavras vazias nem números soltos. */
export function descriptionTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of matchKey(text).split(/[^A-Z0-9]+/)) {
    if (w.length < 3 || /^\d+$/.test(w) || STOP.has(w)) continue;
    out.add(w);
  }
  return out;
}

/** 0–1: fração dos tokens do lado menor que aparecem no outro (prefixo de 4+ letras conta). */
export function descriptionSimilarity(a: string, b: string): number {
  const A = descriptionTokens(a);
  const B = descriptionTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  let hits = 0;
  for (const s of small) {
    if (big.has(s)) hits++;
    else if (s.length >= 4 && [...big].some((x) => x.length >= 4 && (x.startsWith(s) || s.startsWith(x)))) hits++;
  }
  return hits / small.size;
}

/** Pontua o par (null = não é candidato). */
export function scorePlannedMatch(o: Pick<PlannedOccurrence, "amountCents" | "date" | "description">, tx: MatchTx): number | null {
  if (tx.amountCents <= 0 || tx.hiddenAggregate || tx.kind === "pagamento" || tx.kind === "estorno" || tx.kind === "encargo") return null;
  const diffPct = Math.abs(tx.amountCents - o.amountCents) / o.amountCents;
  if (diffPct > MATCH_AMOUNT_TOLERANCE + 1e-9) return null;
  const amount = diffPct === 0 ? 50 : 40 - Math.round((diffPct / MATCH_AMOUNT_TOLERANCE) * 15); // 25–40

  const days = Math.abs(diffDays(tx.postedOn, o.date));
  let date: number;
  if (days <= MATCH_DATE_WINDOW_DAYS) date = 30 - 2 * days; // 10–30
  else if (tx.card && (tx.statementMonth === monthKey(o.date) || tx.statementMonth === addMonthsToKey(monthKey(o.date), 1))) date = 8;
  else return null;

  const sim = descriptionSimilarity(o.description, `${tx.descriptionRaw} ${tx.merchantName ?? ""}`);
  return Math.min(100, amount + date + Math.round(sim * 20));
}

export function matchConfidence(score: number, ambiguous: boolean): MatchConfidence {
  const c: MatchConfidence = score >= 75 ? "alta" : score >= 55 ? "media" : "baixa";
  return ambiguous && c === "alta" ? "media" : c;
}

const occKey = (plannedId: string, date: IsoDate) => `${plannedId}|${date}`;

export interface SuggestInput {
  planned: readonly PlannedExpense[];
  txs: readonly MatchTx[];
  marks: readonly PlannedMark[];
  today: IsoDate;
  lookbackDays?: number;
  /** ocorrências próximas também entram (compra adiantada) */
  aheadDays?: number;
}

/** Ocorrências da janela (passadas e próximas) que ainda não têm baixa "feito" nem foram dispensadas. */
export function openOccurrences(planned: readonly PlannedExpense[], marks: readonly PlannedMark[], from: IsoDate, to: IsoDate): PlannedOccurrence[] {
  const closed = new Set(marks.filter((m) => m.status === "feito" || m.transactionId === null).map((m) => occKey(m.plannedId, m.occurrenceDate)));
  return planned
    .flatMap((p) => occurrencesBetween(p, from, to))
    .filter((o) => !closed.has(occKey(o.id, o.date)))
    .sort((a, b) => a.date.localeCompare(b.date) || b.amountCents - a.amountCents);
}

/** Ocorrências já passadas sem baixa, para marcar "feito" à mão (mais recentes primeiro). */
export function pastOpenOccurrences(planned: readonly PlannedExpense[], marks: readonly PlannedMark[], today: IsoDate, lookbackDays = MATCH_LOOKBACK_DAYS): PlannedOccurrence[] {
  return openOccurrences(planned, marks, addDays(today, -lookbackDays), addDays(today, -1)).reverse();
}

/**
 * Sugestões de baixa: no máximo uma por ocorrência e um lançamento por sugestão.
 * Atribuição gulosa pela maior pontuação; pares recusados (✕) e lançamentos já usados numa baixa ficam de fora.
 */
export function suggestPlannedMatches(input: SuggestInput): PlannedMatchSuggestion[] {
  const lookback = input.lookbackDays ?? MATCH_LOOKBACK_DAYS;
  const ahead = input.aheadDays ?? MATCH_DATE_WINDOW_DAYS;
  const occs = openOccurrences(input.planned, input.marks, addDays(input.today, -lookback), addDays(input.today, ahead));
  const usedTx = new Set(input.marks.filter((m) => m.status === "feito" && m.transactionId).map((m) => m.transactionId!));
  const rejected = new Set(input.marks.filter((m) => m.status === "ignorado" && m.transactionId).map((m) => `${occKey(m.plannedId, m.occurrenceDate)}|${m.transactionId}`));

  const pairs: { o: PlannedOccurrence; tx: MatchTx; score: number }[] = [];
  const perOcc = new Map<string, number[]>();
  for (const o of occs) {
    const k = occKey(o.id, o.date);
    for (const tx of input.txs) {
      if (usedTx.has(tx.id) || rejected.has(`${k}|${tx.id}`)) continue;
      const score = scorePlannedMatch(o, tx);
      if (score === null || score < MIN_SCORE) continue;
      pairs.push({ o, tx, score });
      const list = perOcc.get(k);
      if (list) list.push(score);
      else perOcc.set(k, [score]);
    }
  }
  pairs.sort((a, b) => b.score - a.score || Math.abs(diffDays(a.tx.postedOn, a.o.date)) - Math.abs(diffDays(b.tx.postedOn, b.o.date)) || a.tx.id.localeCompare(b.tx.id));

  const doneOcc = new Set<string>();
  const doneTx = new Set<string>();
  const out: PlannedMatchSuggestion[] = [];
  for (const p of pairs) {
    const k = occKey(p.o.id, p.o.date);
    if (doneOcc.has(k) || doneTx.has(p.tx.id)) continue;
    doneOcc.add(k);
    doneTx.add(p.tx.id);
    const scores = [...perOcc.get(k)!].sort((a, b) => b - a);
    const ambiguous = scores.length > 1 && scores[0]! - scores[1]! < AMBIGUOUS_GAP;
    out.push({ occurrence: p.o, tx: p.tx, score: p.score, confidence: matchConfidence(p.score, ambiguous), ambiguous });
  }
  return out.sort((a, b) => a.occurrence.date.localeCompare(b.occurrence.date));
}
