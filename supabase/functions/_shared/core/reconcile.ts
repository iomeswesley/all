// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import type { ParsedStatement, TxKind, TxSection } from "./parsers/types.ts";

/** Dados declarados pelo banco na fatura. */
export interface DeclaredTotals {
  totalDueCents: number;
  previousBalanceCents: number | null;
  /** despesas Brasil + exterior (R$) */
  expensesCents: number;
  expensesUsdCents: number | null;
  paymentsCents: number;
  creditsCents: number;
  futureObligationsCents: number | null;
}

/** O mínimo de um lançamento para conferir os totais. */
export interface ReconTx {
  amountCents: number;
  amountUsdCents: number | null;
  kind: TxKind;
  section: TxSection;
  installmentN: number | null;
  installmentTotal: number | null;
}

export type CheckStatus = "ok" | "rounding" | "fail";

export interface ReconcileCheck {
  id: "total" | "expenses" | "payments" | "credits" | "usd" | "future_obligations";
  label: string;
  expectedCents: number;
  actualCents: number;
  /** actual − expected */
  diffCents: number;
  status: CheckStatus;
  note?: string;
}

/** "unverified": o arquivo não traz total para conferir (OFX, JSON sem total) — a soma não pôde ser verificada. */
export type ReconcileStatus = CheckStatus | "unverified";

export interface ReconcileResult {
  status: ReconcileStatus;
  /** Pode confirmar sem revisão manual (nenhuma checagem em "fail"). */
  canAutoConfirm: boolean;
  /** Total calculado a partir dos lançamentos (saldo anterior + despesas − pagamentos − créditos) */
  computedTotalCents: number;
  /** Diferença do total (calculado − declarado) */
  totalDiffCents: number;
  /** Σ (parcelas restantes × valor da parcela) */
  computedFutureCents: number;
  checks: ReconcileCheck[];
}

/**
 * O banco arredonda parcelas: as primeiras saem alguns centavos maiores que as
 * últimas. Estimar o saldo futuro pelo valor atual da parcela erra por até
 * este valor por parcela restante, sem que isso seja um erro de leitura.
 */
export const ROUNDING_CENTS_PER_REMAINING_INSTALLMENT = 5;

export function projectedFutureObligations(txs: readonly ReconTx[]): { cents: number; remainingInstallments: number } {
  let cents = 0;
  let remaining = 0;
  for (const t of txs) {
    if (t.kind !== "parcela" || t.installmentN === null || t.installmentTotal === null) continue;
    const left = Math.max(t.installmentTotal - t.installmentN, 0);
    cents += left * t.amountCents;
    remaining += left;
  }
  return { cents, remainingInstallments: remaining };
}

/** Totais de lançamentos que o usuário não enxerga (gasto pessoal do parceiro), para a conferência fechar. */
export interface HiddenSums {
  expensesCents: number;
  expensesUsdCents: number;
  /** Σ (parcelas restantes × valor) dos lançamentos ocultos */
  futureCents: number;
  remainingInstallments: number;
}

export function reconcile(declared: DeclaredTotals, txs: readonly ReconTx[], hidden?: HiddenSums): ReconcileResult {
  const expenses = txs.filter((t) => t.section !== "pagamentos").reduce((a, t) => a + t.amountCents, 0) + (hidden?.expensesCents ?? 0);
  const payments = 0 - txs.filter((t) => t.kind === "pagamento").reduce((a, t) => a + t.amountCents, 0);
  const credits = 0 - txs.filter((t) => t.section === "pagamentos" && t.kind !== "pagamento").reduce((a, t) => a + t.amountCents, 0);
  const usd = txs.reduce((a, t) => a + (t.amountUsdCents ?? 0), 0) + (hidden?.expensesUsdCents ?? 0);
  const base = projectedFutureObligations(txs);
  const future = { cents: base.cents + (hidden?.futureCents ?? 0), remainingInstallments: base.remainingInstallments + (hidden?.remainingInstallments ?? 0) };

  const previous = declared.previousBalanceCents ?? 0;
  const computedTotal = previous + expenses - payments - credits;

  const mk = (id: ReconcileCheck["id"], label: string, expected: number, actual: number, extra: Partial<ReconcileCheck> = {}): ReconcileCheck => ({
    id, label, expectedCents: expected, actualCents: actual, diffCents: actual - expected, status: actual === expected ? "ok" : "fail", ...extra,
  });

  const checks: ReconcileCheck[] = [
    mk("total", "Total da fatura = saldo anterior + lançamentos − pagamentos − créditos", declared.totalDueCents, computedTotal),
    mk("expenses", "Soma dos lançamentos = despesas do resumo", declared.expensesCents, expenses),
    mk("payments", "Pagamentos", declared.paymentsCents, payments),
    mk("credits", "Créditos e estornos", declared.creditsCents, credits),
  ];
  if (declared.expensesUsdCents !== null) checks.push(mk("usd", "Despesas em US$", declared.expensesUsdCents, usd));

  if (declared.futureObligationsCents !== null) {
    const tolerance = future.remainingInstallments * ROUNDING_CENTS_PER_REMAINING_INSTALLMENT;
    const check = mk("future_obligations", "Parcelas futuras = saldo de obrigações futuras", declared.futureObligationsCents, future.cents);
    if (check.diffCents !== 0 && Math.abs(check.diffCents) <= tolerance) {
      check.status = "rounding";
      check.note = "Diferença de arredondamento de parcelas (o banco ajusta centavos nas últimas parcelas).";
    }
    checks.push(check);
  }

  const status: CheckStatus = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "rounding") ? "rounding" : "ok";
  return {
    status,
    canAutoConfirm: status !== "fail",
    computedTotalCents: computedTotal,
    totalDiffCents: computedTotal - declared.totalDueCents,
    computedFutureCents: future.cents,
    checks,
  };
}

export function declaredFromParsed(st: ParsedStatement): DeclaredTotals {
  return {
    totalDueCents: st.totalDueCents,
    previousBalanceCents: st.summary.previousBalanceCents,
    expensesCents: st.summary.domesticExpensesCents + st.summary.foreignExpensesCents,
    expensesUsdCents: st.summary.foreignExpensesUsdCents,
    paymentsCents: st.summary.paymentsCents,
    creditsCents: st.summary.creditsCents,
    futureObligationsCents: st.futureObligationsCents,
  };
}

/**
 * Conferência para fontes sem os totais do resumo da fatura (OFX, JSON assistido).
 * Com total informado: Σ lançamentos (compras − estornos, sem pagamentos) = total. Sem total: "unverified".
 */
export function reconcileGeneric(declaredTotalCents: number | null, txs: readonly ReconTx[]): ReconcileResult {
  const computed = txs.filter((t) => t.kind !== "pagamento").reduce((a, t) => a + t.amountCents, 0);
  const future = projectedFutureObligations(txs);
  const checks: ReconcileCheck[] = [];
  let status: ReconcileStatus = "unverified";
  if (declaredTotalCents !== null) {
    const diff = computed - declaredTotalCents;
    checks.push({ id: "total", label: "Soma dos lançamentos (compras − estornos) = total informado", expectedCents: declaredTotalCents, actualCents: computed, diffCents: diff, status: diff === 0 ? "ok" : "fail" });
    status = diff === 0 ? "ok" : "fail";
  }
  return {
    status,
    canAutoConfirm: status !== "fail",
    computedTotalCents: computed,
    totalDiffCents: declaredTotalCents === null ? 0 : computed - declaredTotalCents,
    computedFutureCents: future.cents,
    checks,
  };
}

export function reconcileParsed(st: ParsedStatement): ReconcileResult {
  if (st.format !== "santander_pdf") return reconcileGeneric(st.hasDeclaredTotals ? st.totalDueCents : null, st.transactions);
  return reconcile(declaredFromParsed(st), st.transactions);
}
