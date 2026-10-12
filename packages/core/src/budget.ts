import { CAT } from "./categories.ts";
import type { AnalyticsTx } from "./analytics.ts";
import { spending } from "./analytics.ts";

export type BudgetLevel = "ok" | "warn80" | "over100";

export interface BudgetRow {
  categoryId: number;
  /** competência "AAAA-MM" em que o limite passou a valer */
  month: string;
  limitCents: number;
}

export interface BudgetStatus {
  categoryId: number;
  limitCents: number;
  spentCents: number;
  /** gasto / limite, em % (pode passar de 100) */
  percent: number;
  remainingCents: number;
  level: BudgetLevel;
}

export const WARN_PERCENT = 80;

/** O limite de uma categoria vale até alguém mudar: pega a linha mais recente que não passa do mês pedido. */
export function effectiveBudgets(rows: readonly BudgetRow[], month: string): Map<number, number> {
  const best = new Map<number, BudgetRow>();
  for (const r of rows) {
    if (r.month > month) continue;
    const cur = best.get(r.categoryId);
    if (!cur || r.month > cur.month) best.set(r.categoryId, r);
  }
  const out = new Map<number, number>();
  for (const [id, r] of best) if (r.limitCents > 0) out.set(id, r.limitCents);
  return out;
}

export function levelOf(spentCents: number, limitCents: number): BudgetLevel {
  if (limitCents <= 0) return "ok";
  // inteiros: spent >= limite → 100%; spent*100 >= limite*80 → 80%
  if (spentCents >= limitCents) return "over100";
  if (spentCents * 100 >= limitCents * WARN_PERCENT) return "warn80";
  return "ok";
}

export function budgetStatuses(limits: ReadonlyMap<number, number>, monthTxs: readonly AnalyticsTx[]): BudgetStatus[] {
  const spent = new Map<number, number>();
  for (const t of spending(monthTxs)) {
    const id = t.categoryId ?? CAT.OUTROS;
    spent.set(id, (spent.get(id) ?? 0) + t.amountCents);
  }
  return [...limits.entries()]
    .map(([categoryId, limitCents]) => {
      const spentCents = Math.max(spent.get(categoryId) ?? 0, 0);
      return {
        categoryId,
        limitCents,
        spentCents,
        percent: Math.round((spentCents / limitCents) * 100),
        remainingCents: limitCents - spentCents,
        level: levelOf(spentCents, limitCents),
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

export type AlertLevel = "warn80" | "over100";
export interface BudgetAlert {
  categoryId: number;
  month: string;
  level: AlertLevel;
  status: BudgetStatus;
}

export const alertKey = (categoryId: number, month: string, level: AlertLevel) => `${month}|${categoryId}|${level}`;

/**
 * Quais alertas ainda não foram enviados. Cada nível sai uma única vez por categoria e mês;
 * se o gasto já passou de 100%, o aviso de 80% é dispensado (não faz sentido avisar os dois).
 */
export function pendingAlerts(statuses: readonly BudgetStatus[], month: string, alreadySent: ReadonlySet<string>): BudgetAlert[] {
  const out: BudgetAlert[] = [];
  for (const s of statuses) {
    if (s.level === "ok") continue;
    if (s.level === "over100") {
      if (!alreadySent.has(alertKey(s.categoryId, month, "over100"))) out.push({ categoryId: s.categoryId, month, level: "over100", status: s });
    } else if (!alreadySent.has(alertKey(s.categoryId, month, "warn80")) && !alreadySent.has(alertKey(s.categoryId, month, "over100"))) {
      out.push({ categoryId: s.categoryId, month, level: "warn80", status: s });
    }
  }
  return out;
}
