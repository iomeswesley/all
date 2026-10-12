import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import type { AnalyticsTx, RecurringTx } from "@financas/core";
import { supabase } from "./supabase";

/** O PostgREST devolve no máximo 1000 linhas por chamada: pagina até acabar. */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) return out;
  }
}

/** Carrega ao focar a tela e permite recarregar manualmente. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loaderRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => void reload(), [reload, ...deps]));
  return { data, error, loading, reload };
}

export interface TxRow extends AnalyticsTx, RecurringTx {
  id: string;
  statementId: string;
  descriptionClean: string;
  amountUsdCents: number | null;
  installmentN: number | null;
  installmentTotal: number | null;
  needsReview: boolean;
  cardLast4: string | null;
}

const VIEW_COLUMNS =
  "id, statement_id, statement_month, posted_on, description_raw, description_clean, merchant_name, amount_cents, amount_usd_cents, category_id, kind, owner_user_id, is_private, installment_n, installment_total, needs_review, card_last4";

interface ViewRow {
  id: string; statement_id: string; statement_month: string; posted_on: string; description_raw: string; description_clean: string;
  merchant_name: string | null; amount_cents: number; amount_usd_cents: number | null; category_id: number | null; kind: TxRow["kind"];
  owner_user_id: string | null; is_private: boolean; installment_n: number | null; installment_total: number | null; needs_review: boolean; card_last4: string | null;
}

export const toTxRow = (r: ViewRow): TxRow => ({
  id: r.id,
  statementId: r.statement_id,
  statementMonth: r.statement_month,
  postedOn: r.posted_on,
  descriptionRaw: r.description_raw,
  descriptionClean: r.description_clean,
  merchantName: r.merchant_name,
  amountCents: Number(r.amount_cents),
  amountUsdCents: r.amount_usd_cents === null ? null : Number(r.amount_usd_cents),
  categoryId: r.category_id,
  kind: r.kind,
  ownerUserId: r.owner_user_id,
  isPrivate: r.is_private,
  installmentN: r.installment_n,
  installmentTotal: r.installment_total,
  needsReview: r.needs_review,
  cardLast4: r.card_last4,
});

/** Lançamentos das faturas confirmadas (competência = mês do vencimento). */
export async function fetchConfirmedTransactions(): Promise<TxRow[]> {
  const rows = await fetchAll<ViewRow>((from, to) =>
    supabase.from("v_transactions").select(VIEW_COLUMNS).order("posted_on", { ascending: false }).order("id").range(from, to) as unknown as PromiseLike<{ data: ViewRow[] | null; error: { message: string } | null }>,
  );
  return rows.map(toTxRow);
}

export interface StatementRow {
  id: string;
  status: "needs_review" | "confirmed";
  closing_date: string;
  due_date: string;
  declared_total_cents: number;
  declared_previous_balance_cents: number | null;
  declared_payments_cents: number | null;
  declared_credits_cents: number | null;
  declared_expenses_cents: number | null;
  declared_expenses_usd_cents: number | null;
  declared_future_cents: number | null;
  computed_total_cents: number;
  computed_future_cents: number | null;
  reconcile_status: "ok" | "rounding" | "fail";
  reconcile_checks: unknown;
  forced_diff_cents: number | null;
  minimum_payment_cents: number | null;
  credit_limit_cents: number | null;
  best_purchase_date: string | null;
  annuity_cents: number | null;
  annuity_paid_cents: number | null;
  annuity_discount_percent: number | null;
  file_path: string;
  account_id: string;
}

export const STATEMENT_COLUMNS =
  "id, status, closing_date, due_date, declared_total_cents, declared_previous_balance_cents, declared_payments_cents, declared_credits_cents, declared_expenses_cents, declared_expenses_usd_cents, declared_future_cents, computed_total_cents, computed_future_cents, reconcile_status, reconcile_checks, forced_diff_cents, minimum_payment_cents, credit_limit_cents, best_purchase_date, annuity_cents, annuity_paid_cents, annuity_discount_percent, file_path, account_id";

export async function fetchStatements(): Promise<StatementRow[]> {
  const { data, error } = await supabase.from("statements").select(STATEMENT_COLUMNS).order("due_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({ ...(s as unknown as StatementRow), declared_total_cents: Number(s.declared_total_cents), computed_total_cents: Number(s.computed_total_cents) }));
}
