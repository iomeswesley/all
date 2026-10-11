import { addMonthsToKey, monthKey } from "./dates.ts";

export interface InstallmentTx {
  descriptionRaw: string;
  amountCents: number;
  installmentN: number | null;
  installmentTotal: number | null;
  postedOn: string;
}

export interface FutureInstallmentItem {
  description: string;
  /** número da parcela que vence nesse mês */
  n: number;
  total: number;
  amountCents: number;
}

export interface FutureMonth {
  /** competência da fatura (mês do vencimento) */
  monthKey: string;
  totalCents: number;
  items: FutureInstallmentItem[];
}

/** Mês da fatura = mês do vencimento (como na fatura "0926" = vence em setembro). */
export function statementMonthKey(dueDate: string): string {
  return monthKey(dueDate);
}

/**
 * Linha do tempo das parcelas futuras ("piso da fatura" dos próximos meses),
 * a partir das parcelas da fatura atual.
 */
export function futureInstallmentTimeline(txs: readonly InstallmentTx[], currentStatementMonth: string): { months: FutureMonth[]; totalCommittedCents: number } {
  const byMonth = new Map<string, FutureMonth>();
  let total = 0;
  for (const t of txs) {
    if (t.installmentN === null || t.installmentTotal === null) continue;
    for (let k = 1; t.installmentN + k <= t.installmentTotal; k++) {
      const key = addMonthsToKey(currentStatementMonth, k);
      const entry = byMonth.get(key) ?? { monthKey: key, totalCents: 0, items: [] };
      entry.items.push({ description: t.descriptionRaw, n: t.installmentN + k, total: t.installmentTotal, amountCents: t.amountCents });
      entry.totalCents += t.amountCents;
      total += t.amountCents;
      byMonth.set(key, entry);
    }
  }
  const months = [...byMonth.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  for (const m of months) m.items.sort((a, b) => b.amountCents - a.amountCents);
  return { months, totalCommittedCents: total };
}
