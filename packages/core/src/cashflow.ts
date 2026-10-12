import { totalSpent } from "./analytics.ts";
import { addMonthsToKey } from "./dates.ts";
import type { FutureMonth } from "./installments.ts";
import { merchantKey } from "./normalize.ts";
import type { TxKind } from "./parsers/types.ts";
import type { RecurringReport } from "./recurring.ts";

export interface CashflowTx {
  statementMonth: string;
  descriptionRaw: string;
  amountCents: number;
  kind: TxKind;
  categoryId: number | null;
  ownerUserId: string | null;
  postedOn: string;
  hiddenAggregate?: boolean;
}

export interface CashflowMonth {
  monthKey: string;
  incomeCents: number;
  /** recorrências ativas + outros fixos informados */
  fixedCents: number;
  /** parcelas já contratadas que vencem no mês */
  installmentsCents: number;
  /** média dos últimos meses de gasto variável */
  variableCents: number;
  outCents: number;
  netCents: number;
  cumulativeNetCents: number;
}

export interface CashflowProjection {
  months: CashflowMonth[];
  variableAvgCents: number;
  fixedCents: number;
  /** média do saldo projetado por mês (para metas) */
  avgNetCents: number;
}

export interface CashflowInput {
  latestMonth: string;
  txs: readonly CashflowTx[];
  recurring: RecurringReport;
  /** parcelas futuras por mês (de futureInstallmentTimeline) */
  futureInstallments: readonly FutureMonth[];
  incomeCents: number;
  /** outros fixos fora do cartão (aluguel, condomínio…) */
  otherFixedCents: number;
  months?: number;
  /** quantos meses recentes entram na média do variável */
  variableWindow?: number;
}

/** Gasto "variável" de um mês = total − parcelas − encargos − cobranças recorrentes. */
export function variableOfMonth(txs: readonly CashflowTx[], month: string, recurringKeys: ReadonlySet<string>): number {
  const monthTxs = txs.filter((t) => t.statementMonth === month && !t.hiddenAggregate);
  const total = totalSpent(monthTxs);
  const excluded = monthTxs
    .filter((t) => t.kind === "parcela" || t.kind === "encargo" || (t.kind === "avista" && recurringKeys.has(merchantKey(t.descriptionRaw))))
    .reduce((a, t) => a + t.amountCents, 0);
  return Math.max(total - excluded, 0);
}

export function projectCashflow(input: CashflowInput): CashflowProjection {
  const { latestMonth, txs, recurring, futureInstallments, incomeCents, otherFixedCents } = input;
  const horizon = input.months ?? 6;
  const window = input.variableWindow ?? 3;
  const recurringKeys = new Set(recurring.items.filter((i) => i.active).map((i) => i.key));

  const recentMonths = Array.from({ length: window }, (_, i) => addMonthsToKey(latestMonth, -i)).filter((m) => txs.some((t) => t.statementMonth === m));
  const variableAvg = recentMonths.length === 0 ? 0 : Math.round(recentMonths.reduce((a, m) => a + variableOfMonth(txs, m, recurringKeys), 0) / recentMonths.length);
  const fixed = recurring.monthlyTotalCents + otherFixedCents;
  const byMonth = new Map(futureInstallments.map((m) => [m.monthKey, m.totalCents]));

  let cumulative = 0;
  const months: CashflowMonth[] = [];
  for (let i = 1; i <= horizon; i++) {
    const monthKey = addMonthsToKey(latestMonth, i);
    const installments = byMonth.get(monthKey) ?? 0;
    const out = fixed + installments + variableAvg;
    const net = incomeCents - out;
    cumulative += net;
    months.push({ monthKey, incomeCents, fixedCents: fixed, installmentsCents: installments, variableCents: variableAvg, outCents: out, netCents: net, cumulativeNetCents: cumulative });
  }
  return { months, variableAvgCents: variableAvg, fixedCents: fixed, avgNetCents: months.length ? Math.round(months.reduce((a, m) => a + m.netCents, 0) / months.length) : 0 };
}
