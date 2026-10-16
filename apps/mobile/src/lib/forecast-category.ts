import { effectiveBudgets, forecastByCategory, forecastMonths, forecastVsBudget, type ForecastBudgetComparison, type PlannedExpense } from "@financas/core";
import { latestStatementMonth, type Analysis } from "./analysis";

/**
 * Previsão por categoria × orçamento efetivo de um mês previsto.
 * Sem `monthKey`, usa o primeiro mês previsto (o "próximo mês"). null sem histórico ou se o mês não estiver no horizonte.
 */
export function categoryForecastFor(a: Analysis, planned: readonly PlannedExpense[], today: string, monthKey?: string): ForecastBudgetComparison | null {
  const last = latestStatementMonth(a);
  if (!last) return null;
  const input = { txs: a.txs, lastMonth: last, planned, today };
  const months = forecastByCategory(input, forecastMonths(input));
  const month = monthKey ? months.find((m) => m.monthKey === monthKey) : months[0];
  if (!month) return null;
  return forecastVsBudget(month, effectiveBudgets(a.budgetRows, month.monthKey));
}

/** "Alimentação (mercado)" → "Mercado"; "Transporte/combustível" → "Transporte". */
export function shortCategoryName(name: string): string {
  const inner = /\(([^)]+)\)/.exec(name)?.[1];
  const base = (inner ?? name).split("/")[0]!.trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}
