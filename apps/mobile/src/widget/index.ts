import { widgetPayloadFromData, type PlannedExpense } from "@financas/core";
import { useEffect } from "react";
import { latestStatementMonth, type Analysis } from "@/lib/analysis";
import { fetchDashboardTransactions, fetchStatements } from "@/lib/data";
import { fetchPlanned } from "@/lib/planned";
import { privacyOn, usePrefs } from "@/lib/prefs";
import { localToday } from "@/lib/today";
import { clearWidget, publishWidget, widgetSupported } from "./bridge";

export { clearWidget, widgetSupported };

type SyncData = Pick<Analysis, "txs" | "statements">;

/** Monta o payload com os dados que a tela já tem e publica (no-op sem widget nativo). */
export function syncWidget(analysis: SyncData, planned: readonly PlannedExpense[], privacy = privacyOn): Promise<void> {
  if (!widgetSupported()) return Promise.resolve();
  const lastMonth = latestStatementMonth(analysis);
  return publishWidget(widgetPayloadFromData({ txs: analysis.txs, lastMonth, planned, today: localToday(), privacy, updatedAt: new Date() }));
}

/** Hook para o Início/Planejar: republica quando os dados ou o modo privacidade mudam. */
export function useWidgetSync(analysis: SyncData | null | undefined, planned: readonly PlannedExpense[] | null | undefined): void {
  const { privacy } = usePrefs();
  useEffect(() => {
    if (!analysis || !planned) return;
    void syncWidget(analysis, planned, privacy);
  }, [analysis, planned, privacy]);
}

/**
 * Depois de salvar um gasto (lançamento ou gasto futuro): busca o necessário e republica.
 * Fire-and-forget; sem widget nativo nem faz as consultas.
 */
export function refreshWidget(): void {
  if (!widgetSupported()) return;
  void (async () => {
    try {
      const [txs, statements, planned] = await Promise.all([fetchDashboardTransactions(() => ""), fetchStatements(), fetchPlanned()]);
      await syncWidget({ txs, statements }, planned);
    } catch {
      // sem rede: o widget fica com o último payload até a próxima abertura do Início
    }
  })();
}
