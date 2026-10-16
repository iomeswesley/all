import { supabase } from "./supabase";

/** Mesada 🔒 de um membro no mês: só totais (o banco nunca devolve os itens do par). */
export interface AllowanceRow {
  userId: string;
  displayName: string;
  /** null = sem mesada combinada */
  monthlyCents: number | null;
  usedCents: number;
  isMe: boolean;
}

interface Raw { user_id: string; display_name: string; monthly_cents: number | string | null; used_cents: number | string; is_me: boolean }

export async function fetchAllowance(month: string): Promise<AllowanceRow[]> {
  const { data, error } = await supabase.rpc("allowance_status", { p_month: month });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Raw[]).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    monthlyCents: r.monthly_cents === null ? null : Number(r.monthly_cents),
    usedCents: Number(r.used_cents),
    isMe: r.is_me,
  }));
}

/** Define (ou remove, com null) a mesada de um membro. Quem mudou é gravado pelo banco. */
export async function saveAllowance(householdId: string, userId: string, monthlyCents: number | null) {
  const { error } = monthlyCents === null
    ? await supabase.from("member_allowances").delete().eq("household_id", householdId).eq("user_id", userId)
    : await supabase.from("member_allowances").upsert({ household_id: householdId, user_id: userId, monthly_cents: monthlyCents }, { onConflict: "household_id,user_id" });
  if (error) throw new Error(error.message);
}
