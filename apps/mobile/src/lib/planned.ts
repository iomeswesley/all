import type { PlannedExpense, PlannedInput } from "@financas/core";
import { supabase } from "./supabase";

const COLUMNS = "id, description, amount_cents, first_date, repeat, occurrences, category_id";

interface Row { id: string; description: string; amount_cents: number; first_date: string; repeat: PlannedExpense["repeat"]; occurrences: number | null; category_id: number | null }

const toPlanned = (r: Row): PlannedExpense => ({
  id: r.id,
  description: r.description,
  amountCents: Number(r.amount_cents),
  firstDate: r.first_date,
  repeat: r.repeat,
  occurrences: r.occurrences,
  categoryId: r.category_id,
});

const toRow = (p: PlannedInput) => ({
  description: p.description.trim(),
  amount_cents: p.amountCents,
  first_date: p.firstDate,
  repeat: p.repeat,
  occurrences: p.repeat === "once" ? null : p.occurrences,
  category_id: p.categoryId,
});

export async function fetchPlanned(): Promise<PlannedExpense[]> {
  const { data, error } = await supabase.from("planned_expenses").select(COLUMNS).order("first_date");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toPlanned);
}

export async function savePlanned(householdId: string, p: PlannedInput, id?: string) {
  const { error } = id
    ? await supabase.from("planned_expenses").update({ ...toRow(p), updated_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("planned_expenses").insert({ ...toRow(p), household_id: householdId });
  if (error) throw new Error(error.message);
}

export async function deletePlanned(id: string) {
  const { error } = await supabase.from("planned_expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
