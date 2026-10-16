// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { addMonths, isoDate, monthKey, splitIso, type IsoDate } from "./dates.ts";
import { decodeDescription, merchantKey, stripAccents } from "./normalize.ts";
import { effectiveDate } from "./query.ts";
import type { TxKind } from "./parsers/types.ts";

/**
 * Busca de lançamentos com totais ao vivo (tela "Lançamentos").
 *
 * Decisão sobre o gasto pessoal do par (linhas `hiddenAggregate`): elas NUNCA aparecem na lista
 * (não têm itens) e NÃO entram no total/quantidade/média, que somam só o que está na tela — assim
 * "total = soma das linhas" vale sempre. Quando só há filtros que essas linhas conseguem respeitar
 * (período, categoria, de quem), o resumo informa à parte quanto do gasto pessoal do par cai no filtro
 * (`hiddenCents`), para a tela mostrar como nota ("+ R$ X pessoal do par"). Com busca por texto ou por
 * tipo não dá para saber o que casaria, então a nota some.
 */
export interface SearchTx {
  statementMonth: string;
  postedOn: IsoDate;
  descriptionRaw: string;
  descriptionClean?: string | null;
  merchantName?: string | null;
  amountCents: number;
  categoryId: number | null;
  kind: TxKind;
  ownerUserId: string | null;
  /** lançamento manual (Pix, dinheiro, débito, boleto) */
  manual?: boolean;
  hiddenAggregate?: boolean;
  /** texto de busca pré-calculado (`withSearchText`), para não normalizar a cada tecla */
  searchText?: string;
}

export type SearchPeriod = "month" | "3m" | "year" | "all";
export type SearchOwner = "me" | "partner" | "shared";
export type SearchType = "avista" | "parcela" | "manual" | "estorno" | "encargo";

export const SEARCH_PERIOD_LABEL: Record<SearchPeriod, string> = { month: "Este mês", "3m": "3 meses", year: "Este ano", all: "Tudo" };
export const SEARCH_TYPE_LABEL: Record<SearchType, string> = { avista: "À vista", parcela: "Parcela", manual: "Pix/dinheiro", estorno: "Estorno", encargo: "Encargo" };

export interface SearchFilters {
  text?: string;
  period?: SearchPeriod;
  categoryId?: number | null;
  owner?: SearchOwner | null;
  type?: SearchType | null;
}

export interface SearchContext {
  today: IsoDate;
  meUserId: string;
  partnerUserId?: string | null;
}

export interface SearchSummary {
  totalCents: number;
  count: number;
  /** ticket médio (arredondado); 0 sem lançamentos */
  averageCents: number;
}

export interface SearchResult<T extends SearchTx> extends SearchSummary {
  rows: T[];
  /** gasto pessoal do par que cai no filtro (fora da lista e do total); null quando não dá para saber */
  hiddenCents: number | null;
}

export type SearchListItem<T extends SearchTx> =
  | { type: "month"; key: string; month: string; totalCents: number; count: number }
  | { type: "tx"; key: string; tx: T; index: number };

/** Texto sem acento, minúsculo e com espaços colapsados. */
export function normalizeSearchText(s: string): string {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Tudo o que a busca por texto enxerga num lançamento (estabelecimento e descrições normalizados). */
export function searchHaystack(t: Pick<SearchTx, "descriptionRaw" | "descriptionClean" | "merchantName">): string {
  return normalizeSearchText([t.merchantName ?? "", t.descriptionClean ?? "", decodeDescription(t.descriptionRaw).display, merchantKey(t.descriptionRaw)].join(" "));
}

/** Pré-calcula o texto de busca de cada lançamento (uma vez por carga de dados). */
export function withSearchText<T extends SearchTx>(txs: readonly T[]): T[] {
  return txs.map((t) => (t.hiddenAggregate ? t : { ...t, searchText: searchHaystack(t) }));
}

export function searchTypeOf(t: Pick<SearchTx, "kind" | "manual">): SearchType | null {
  if (t.kind === "pagamento") return null;
  if (t.kind === "avista") return t.manual ? "manual" : "avista";
  return t.kind;
}

/** Intervalo [from, to] do período, relativo a "hoje"; null = sem limite. */
export function searchPeriodRange(period: SearchPeriod, today: IsoDate): { from: IsoDate | null; to: IsoDate | null } {
  const { y, m } = splitIso(today);
  const first = isoDate(y, m, 1);
  if (period === "month") return { from: first, to: null };
  if (period === "3m") return { from: addMonths(first, -2), to: null };
  if (period === "year") return { from: isoDate(y, 1, 1), to: null };
  return { from: null, to: null };
}

function matchesBase(t: SearchTx, f: SearchFilters, ctx: SearchContext, range: { from: IsoDate | null; to: IsoDate | null }): boolean {
  if (t.kind === "pagamento") return false;
  const d = effectiveDate(t);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  if (f.categoryId !== undefined && f.categoryId !== null && t.categoryId !== f.categoryId) return false;
  if (f.owner === "me" && t.ownerUserId !== ctx.meUserId) return false;
  if (f.owner === "partner" && (!ctx.partnerUserId || t.ownerUserId !== ctx.partnerUserId)) return false;
  if (f.owner === "shared" && t.ownerUserId !== null) return false;
  return true;
}

export function summarize(rows: readonly Pick<SearchTx, "amountCents">[]): SearchSummary {
  const totalCents = rows.reduce((a, t) => a + t.amountCents, 0);
  return { totalCents, count: rows.length, averageCents: rows.length ? Math.round(totalCents / rows.length) : 0 };
}

const byDateDesc = (a: SearchTx, b: SearchTx) => effectiveDate(b).localeCompare(effectiveDate(a)) || b.amountCents - a.amountCents;

/** Filtra (sem pagamentos de fatura), ordena do mais recente e totaliza. */
export function searchTransactions<T extends SearchTx>(txs: readonly T[], f: SearchFilters, ctx: SearchContext): SearchResult<T> {
  const range = searchPeriodRange(f.period ?? "all", ctx.today);
  const terms = normalizeSearchText(f.text ?? "").split(" ").filter(Boolean);
  const rows: T[] = [];
  let hidden = 0;
  for (const t of txs) {
    if (!matchesBase(t, f, ctx, range)) continue;
    if (t.hiddenAggregate) { hidden += t.amountCents; continue; }
    if (f.type && searchTypeOf(t) !== f.type) continue;
    if (terms.length > 0) {
      const h = t.searchText ?? searchHaystack(t);
      if (!terms.every((w) => h.includes(w))) continue;
    }
    rows.push(t);
  }
  rows.sort(byDateDesc);
  const hiddenCents = terms.length > 0 || f.type ? null : hidden;
  return { ...summarize(rows), rows, hiddenCents };
}

/** Lista achatada para FlatList: cabeçalho de mês (com total do mês) seguido dos lançamentos. */
export function groupByMonth<T extends SearchTx>(rows: readonly T[], keyOf: (t: T, i: number) => string = (_t, i) => String(i)): SearchListItem<T>[] {
  const out: SearchListItem<T>[] = [];
  let header: Extract<SearchListItem<T>, { type: "month" }> | null = null;
  rows.forEach((t, i) => {
    const month = monthKey(effectiveDate(t));
    if (!header || header.month !== month) {
      header = { type: "month", key: `m-${month}`, month, totalCents: 0, count: 0 };
      out.push(header);
    }
    header.totalCents += t.amountCents;
    header.count += 1;
    out.push({ type: "tx", key: keyOf(t, i), tx: t, index: i });
  });
  return out;
}

/** Categorias presentes nos lançamentos (para os chips), da que mais soma para a que menos. */
export function categoriesIn(txs: readonly SearchTx[]): number[] {
  const sums = new Map<number, number>();
  for (const t of txs) {
    if (t.hiddenAggregate || t.kind === "pagamento" || t.categoryId === null) continue;
    sums.set(t.categoryId, (sums.get(t.categoryId) ?? 0) + t.amountCents);
  }
  return [...sums.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
}
