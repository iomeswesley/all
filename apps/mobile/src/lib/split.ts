import { computeSplit, type SplitEntry, type SplitMode, type SplitResult, type SplitRule, type SplitSettlement, type Shares } from "@financas/core";
import type { Member } from "./session";
import { supabase } from "./supabase";

/** Tudo o que a tela de acerto precisa (a conta em si é feita pelo core). */
export interface SplitData {
  entries: SplitEntry[];
  rules: SplitRule[];
  settlements: SplitSettlement[];
  /** percentual de cada pessoa pela renda; null enquanto alguém não informou */
  incomeShares: Shares | null;
  /** quem já informou a renda (só o booleano; o valor do par nunca vem) */
  informed: Record<string, boolean>;
  /** minha renda (só a minha) */
  myIncomeCents: number | null;
}

export interface SplitView extends SplitData {
  result: SplitResult;
}

const monthKeyOf = (date: string) => date.slice(0, 7);

export async function fetchSplitData(): Promise<SplitData> {
  const [entries, rules, settlements, shares, mine] = await Promise.all([
    supabase.rpc("split_entries"),
    supabase.from("split_rules").select("month, mode, custom_user_id, custom_pct").order("month"),
    supabase.from("settlements").select("id, from_user_id, to_user_id, amount_cents, settled_on, note, created_by").order("settled_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.rpc("split_income_shares"),
    supabase.from("member_incomes").select("income_cents").maybeSingle(),
  ]);
  for (const r of [entries, rules, settlements, shares, mine]) if (r.error) throw new Error(r.error.message);

  const shareRows = (shares.data ?? []) as { user_id: string; informed: boolean; share_pct: number | null }[];
  const ready = shareRows.length === 2 && shareRows.every((s) => s.share_pct !== null);
  return {
    entries: ((entries.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      month: r.month as string,
      postedOn: r.posted_on as string,
      description: r.description as string,
      amountCents: Number(r.amount_cents),
      ownerUserId: (r.owner_user_id as string | null) ?? null,
      payerUserId: (r.payer_user_id as string | null) ?? null,
      override: r.share_pct == null && r.paid_by_user_id == null ? null : {
        shareUserId: (r.share_user_id as string | null) ?? null,
        sharePct: (r.share_pct as number | null) ?? null,
        paidByUserId: (r.paid_by_user_id as string | null) ?? null,
      },
    })),
    rules: (rules.data ?? []).map((r) => ({
      month: monthKeyOf(r.month as string),
      mode: r.mode as SplitMode,
      customUserId: (r.custom_user_id as string | null) ?? null,
      customPct: (r.custom_pct as number | null) ?? null,
    })),
    settlements: (settlements.data ?? []).map((s) => ({
      id: s.id as string,
      fromUserId: (s.from_user_id as string | null) ?? null,
      toUserId: (s.to_user_id as string | null) ?? null,
      amountCents: Number(s.amount_cents),
      settledOn: s.settled_on as string,
      note: (s.note as string | null) ?? null,
      createdBy: (s.created_by as string | null) ?? null,
    })),
    incomeShares: ready ? Object.fromEntries(shareRows.map((s) => [s.user_id, s.share_pct!])) : null,
    informed: Object.fromEntries(shareRows.map((s) => [s.user_id, s.informed])),
    myIncomeCents: mine.data ? Number((mine.data as { income_cents: number }).income_cents) : null,
  };
}

/** Carrega e calcula. Sem par no casal, não há acerto (null). */
export async function fetchSplitView(me: Member, partner: Member | null): Promise<SplitView | null> {
  if (!partner) return null;
  const data = await fetchSplitData();
  const result = computeSplit({ users: [me.user_id, partner.user_id], entries: data.entries, rules: data.rules, incomeShares: data.incomeShares, settlements: data.settlements });
  return { ...data, result };
}

/** Grava a regra a partir de um mês ("YYYY-MM"). `fromStart` apaga as anteriores e vale para todo o histórico. */
export async function saveSplitRule(householdId: string, input: { month: string; mode: SplitMode; customUserId: string | null; customPct: number | null; fromStart: boolean }) {
  const month = input.fromStart ? "2000-01" : input.month;
  if (input.fromStart) {
    const del = await supabase.from("split_rules").delete().eq("household_id", householdId);
    if (del.error) throw new Error(del.error.message);
  } else {
    // as regras de meses posteriores deixariam esta sem efeito: a mudança vale "daqui para frente"
    const del = await supabase.from("split_rules").delete().eq("household_id", householdId).gt("month", `${month}-01`);
    if (del.error) throw new Error(del.error.message);
  }
  const { error } = await supabase.from("split_rules").upsert({
    household_id: householdId,
    month: `${month}-01`,
    mode: input.mode,
    custom_user_id: input.mode === "custom" ? input.customUserId : null,
    custom_pct: input.mode === "custom" ? input.customPct : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function saveMyIncome(householdId: string, userId: string, cents: number) {
  const { error } = await supabase.from("member_incomes").upsert({ household_id: householdId, user_id: userId, income_cents: cents, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function addSettlement(householdId: string, input: { fromUserId: string; toUserId: string; amountCents: number; settledOn: string; note: string | null; createdBy: string }) {
  const { error } = await supabase.from("settlements").insert({
    household_id: householdId, from_user_id: input.fromUserId, to_user_id: input.toUserId, amount_cents: input.amountCents,
    settled_on: input.settledOn, note: input.note, created_by: input.createdBy,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSettlement(id: string) {
  const { error } = await supabase.from("settlements").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface OverrideInput {
  shareUserId: string | null;
  sharePct: number | null;
  paidByUserId: string | null;
}

export async function fetchOverride(transactionId: string): Promise<OverrideInput | null> {
  const { data, error } = await supabase.from("split_overrides").select("share_user_id, share_pct, paid_by_user_id").eq("transaction_id", transactionId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { shareUserId: data.share_user_id as string | null, sharePct: data.share_pct as number | null, paidByUserId: data.paid_by_user_id as string | null };
}

/** Grava a exceção; sem divisão nem "quem pagou" diferentes, apaga (volta à regra do casal). */
export async function saveOverride(householdId: string, transactionId: string, o: OverrideInput) {
  const empty = (o.shareUserId === null || o.sharePct === null) && o.paidByUserId === null;
  if (empty) {
    const { error } = await supabase.from("split_overrides").delete().eq("transaction_id", transactionId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from("split_overrides").upsert({
    transaction_id: transactionId, household_id: householdId,
    share_user_id: o.sharePct === null ? null : o.shareUserId, share_pct: o.shareUserId === null ? null : o.sharePct,
    paid_by_user_id: o.paidByUserId, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
