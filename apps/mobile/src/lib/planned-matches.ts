import type { MatchTx, PlannedMark, PlannedMatchStatus } from "@financas/core";
import type { TxRow } from "./data";
import { supabase } from "./supabase";

interface Row { planned_id: string; occurrence_date: string; transaction_id: string | null; status: PlannedMatchStatus }

/** Baixas de gastos planejados do casal ("Já aconteceu?"). */
export async function fetchPlannedMarks(): Promise<PlannedMark[]> {
  const { data, error } = await supabase.from("planned_matches").select("planned_id, occurrence_date, transaction_id, status");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => ({ plannedId: r.planned_id, occurrenceDate: r.occurrence_date, transactionId: r.transaction_id, status: r.status }));
}

export async function savePlannedMark(householdId: string, m: PlannedMark) {
  const { error } = await supabase.from("planned_matches").insert({
    household_id: householdId,
    planned_id: m.plannedId,
    occurrence_date: m.occurrenceDate,
    transaction_id: m.transactionId,
    status: m.status,
  });
  // 23505 = a baixa já existe (o par marcou ao mesmo tempo): dá no mesmo
  if (error && error.code !== "23505") throw new Error(error.message);
}

/** Lançamento do painel → candidato para a baixa (só os reais, sem os totais ocultos do par). */
export const toMatchTx = (t: TxRow): MatchTx => ({
  id: t.id,
  postedOn: t.postedOn,
  statementMonth: t.statementMonth,
  descriptionRaw: t.descriptionRaw,
  merchantName: t.merchantName ?? null,
  amountCents: t.amountCents,
  kind: t.kind,
  card: t.statementId !== "",
  hiddenAggregate: t.hiddenAggregate,
});
