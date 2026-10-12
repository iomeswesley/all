// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { CAT } from "./categories.ts";
import { addMonthsToKey } from "./dates.ts";
import { decodeDescription, merchantKey } from "./normalize.ts";
import type { TxKind } from "./parsers/types.ts";

export interface AnalyticsTx {
  /** competência da fatura (mês do vencimento), "AAAA-MM" */
  statementMonth: string;
  postedOn: string;
  descriptionRaw: string;
  /** nome real do dicionário, se houver */
  merchantName?: string | null;
  amountCents: number;
  categoryId: number | null;
  kind: TxKind;
  /** user id do dono; null = nosso */
  ownerUserId: string | null;
  isPrivate?: boolean;
  /** Linha sintética: total de gasto pessoal do parceiro por categoria/mês (sem itens). Fora de rankings de estabelecimento. */
  hiddenAggregate?: boolean;
}

/** Só gasto: tira pagamentos de fatura. Estornos entram negativos e abatem. */
export function spending<T extends Pick<AnalyticsTx, "kind">>(txs: readonly T[]): T[] {
  return txs.filter((t) => t.kind !== "pagamento");
}

export interface CategoryTotal {
  categoryId: number;
  totalCents: number;
  /** 0–100, arredondado; sobre o total de categorias positivas */
  percent: number;
}

export function totalByCategory(txs: readonly AnalyticsTx[]): CategoryTotal[] {
  const sums = new Map<number, number>();
  for (const t of spending(txs)) {
    const id = t.categoryId ?? CAT.OUTROS;
    sums.set(id, (sums.get(id) ?? 0) + t.amountCents);
  }
  const rows = [...sums.entries()].filter(([, v]) => v > 0);
  const total = rows.reduce((a, [, v]) => a + v, 0);
  return rows
    .map(([categoryId, totalCents]) => ({ categoryId, totalCents, percent: total === 0 ? 0 : Math.round((totalCents / total) * 100) }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

export function totalSpent(txs: readonly AnalyticsTx[]): number {
  return spending(txs).reduce((a, t) => a + t.amountCents, 0);
}

export interface MonthlyCategorySeries {
  months: string[];
  /** categoryId → centavos por mês (mesmo tamanho de `months`) */
  byCategory: Map<number, number[]>;
  totals: number[];
}

/** Barras empilhadas: últimos `count` meses terminando em `endMonth`. */
export function monthlySeries(txs: readonly AnalyticsTx[], endMonth: string, count = 12): MonthlyCategorySeries {
  const months = Array.from({ length: count }, (_, i) => addMonthsToKey(endMonth, i - (count - 1)));
  const index = new Map(months.map((m, i) => [m, i]));
  const byCategory = new Map<number, number[]>();
  const totals = months.map(() => 0);
  for (const t of spending(txs)) {
    const i = index.get(t.statementMonth);
    if (i === undefined) continue;
    const id = t.categoryId ?? CAT.OUTROS;
    const arr = byCategory.get(id) ?? months.map(() => 0);
    arr[i]! += t.amountCents;
    byCategory.set(id, arr);
    totals[i]! += t.amountCents;
  }
  return { months, byCategory, totals };
}

export type ChangeStatus = "subiu" | "caiu" | "novo" | "sumiu" | "igual";

export interface Change {
  key: string;
  label: string;
  currentCents: number;
  previousCents: number;
  diffCents: number;
  /** variação em % sobre o mês anterior (null se não havia gasto antes) */
  percent: number | null;
  status: ChangeStatus;
}

function groupSum(txs: readonly AnalyticsTx[], keyOf: (t: AnalyticsTx) => { key: string; label: string }, skipHidden = false): Map<string, { label: string; cents: number }> {
  const map = new Map<string, { label: string; cents: number }>();
  for (const t of spending(txs)) {
    if (skipHidden && t.hiddenAggregate) continue;
    const { key, label } = keyOf(t);
    const cur = map.get(key) ?? { label, cents: 0 };
    cur.cents += t.amountCents;
    map.set(key, cur);
  }
  return map;
}

export function merchantGroup(t: Pick<AnalyticsTx, "descriptionRaw" | "merchantName">): { key: string; label: string } {
  const key = merchantKey(t.descriptionRaw);
  return { key, label: t.merchantName ?? decodeDescription(t.descriptionRaw).display };
}

export function compareMonths(
  current: readonly AnalyticsTx[],
  previous: readonly AnalyticsTx[],
  by: "category" | "merchant",
  labelOfCategory: (id: number) => string = String,
): Change[] {
  const keyOf =
    by === "category"
      ? (t: AnalyticsTx) => ({ key: String(t.categoryId ?? CAT.OUTROS), label: labelOfCategory(t.categoryId ?? CAT.OUTROS) })
      : (t: AnalyticsTx) => merchantGroup(t);
  const cur = groupSum(current, keyOf, by === "merchant");
  const prev = groupSum(previous, keyOf, by === "merchant");
  const keys = new Set([...cur.keys(), ...prev.keys()]);
  const out: Change[] = [];
  for (const key of keys) {
    const c = cur.get(key)?.cents ?? 0;
    const p = prev.get(key)?.cents ?? 0;
    const label = cur.get(key)?.label ?? prev.get(key)!.label;
    const status: ChangeStatus = p <= 0 && c > 0 ? "novo" : c <= 0 && p > 0 ? "sumiu" : c > p ? "subiu" : c < p ? "caiu" : "igual";
    out.push({ key, label, currentCents: c, previousCents: p, diffCents: c - p, percent: p > 0 ? Math.round(((c - p) / p) * 100) : null, status });
  }
  return out.sort((a, b) => Math.abs(b.diffCents) - Math.abs(a.diffCents));
}

export interface MerchantTotal {
  key: string;
  label: string;
  totalCents: number;
  count: number;
}

export function topMerchants(txs: readonly AnalyticsTx[], n = 10): MerchantTotal[] {
  const map = new Map<string, MerchantTotal>();
  for (const t of spending(txs)) {
    if (t.kind === "encargo" || t.hiddenAggregate) continue;
    const { key, label } = merchantGroup(t);
    const cur = map.get(key) ?? { key, label, totalCents: 0, count: 0 };
    cur.totalCents += t.amountCents;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, n);
}

export interface OwnerSplit {
  mineCents: number;
  partnerCents: number;
  sharedCents: number;
}

/** "Meu" depende de quem olha: passe o id do usuário logado. */
export function splitByOwner(txs: readonly AnalyticsTx[], me: string): OwnerSplit {
  const out: OwnerSplit = { mineCents: 0, partnerCents: 0, sharedCents: 0 };
  for (const t of spending(txs)) {
    if (t.ownerUserId === null) out.sharedCents += t.amountCents;
    else if (t.ownerUserId === me) out.mineCents += t.amountCents;
    else out.partnerCents += t.amountCents;
  }
  return out;
}

/** Transforma os totais de gasto pessoal do parceiro (RPC) em linhas sintéticas para os gráficos. */
export interface HiddenTotal {
  statementMonth: string;
  categoryId: number | null;
  ownerUserId: string;
  totalCents: number;
  count: number;
}

export function hiddenTotalsToTx(rows: readonly HiddenTotal[], labelOf: (ownerUserId: string) => string): AnalyticsTx[] {
  return rows.map((r) => ({
    statementMonth: r.statementMonth,
    postedOn: `${r.statementMonth}-01`,
    descriptionRaw: `GASTO PESSOAL ${labelOf(r.ownerUserId).toUpperCase()}`,
    merchantName: `Gasto pessoal (${labelOf(r.ownerUserId)})`,
    amountCents: r.totalCents,
    categoryId: r.categoryId,
    kind: "avista" as const,
    ownerUserId: r.ownerUserId,
    isPrivate: true,
    hiddenAggregate: true,
  }));
}
