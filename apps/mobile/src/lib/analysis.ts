import { effectiveBudgets, type BudgetRow } from "@financas/core";
import { fetchBudgetRows, fetchDashboardTransactions, fetchStatements, useLoad, type StatementRow, type TxRow } from "./data";
import { useReady } from "./session";

export interface Analysis {
  txs: TxRow[];
  statements: StatementRow[];
  budgetRows: BudgetRow[];
}

/** Tudo o que o painel, o orçamento e o check-in precisam, de uma vez. */
export function useAnalysis() {
  const { members } = useReady();
  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "par";
  return useLoad<Analysis>(async () => {
    const [txs, statements, budgetRows] = await Promise.all([fetchDashboardTransactions(nameOf), fetchStatements(), fetchBudgetRows()]);
    return { txs, statements, budgetRows };
  });
}

export const monthsOf = (txs: readonly { statementMonth: string }[]) => [...new Set(txs.map((t) => t.statementMonth))].sort();

export const budgetsFor = (rows: readonly BudgetRow[], month: string) => effectiveBudgets(rows, month);

/** Competência da fatura confirmada mais recente (lançamentos manuais não "avançam" o painel). */
export function latestStatementMonth(a: Pick<Analysis, "statements" | "txs">): string | undefined {
  const fromStatements = a.statements.filter((s) => s.status === "confirmed").map((s) => s.due_date.slice(0, 7)).sort().at(-1);
  return fromStatements ?? monthsOf(a.txs).at(-1);
}

/** Mês aberto por padrão: o da fatura mais recente. */
export function defaultMonth(a: Pick<Analysis, "statements" | "txs">, months: readonly string[]): string | undefined {
  const m = latestStatementMonth(a);
  return m && months.includes(m) ? m : months.at(-1);
}
