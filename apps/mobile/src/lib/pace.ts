import { computePace, effectiveBudgets, monthKey, type AnalyticsTx, type Pace } from "@financas/core";
import type { Analysis } from "./analysis";
import type { TxRow } from "./data";

/**
 * Ritmo do mês corrente a partir do que o painel já carrega.
 * Manual = sem fatura (Pix, dinheiro…). O gasto pessoal do par chega só como total (sem origem):
 * no mês corrente, sem fatura confirmada, ele só pode ser manual; nos meses passados conta como cartão.
 * null quando não há nada para projetar (nem lançamento no mês, nem histórico).
 */
export function paceFor(a: Analysis, today: string): Pace | null {
  const month = monthKey(today);
  const cardConfirmed = a.statements.some((s) => s.status === "confirmed" && s.due_date.slice(0, 7) === month);
  const isManual = (x: AnalyticsTx) => {
    const t = x as TxRow;
    return t.hiddenAggregate ? t.statementMonth === month && !cardConfirmed : t.statementId === "";
  };
  const pace = computePace({ txs: a.txs, isManual, today, month, cardConfirmed, limits: effectiveBudgets(a.budgetRows, month) });
  return pace.projectedCents > 0 ? pace : null;
}
