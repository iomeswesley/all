import { categorize, type CategorizeContext } from "./categorize.ts";
import { assignDedupeHashes } from "./dedupe.ts";
import { decodeDescription } from "./normalize.ts";
import type { ParsedStatement, ParsedTransaction } from "./parsers/types.ts";
import { reconcileParsed, type ReconcileResult } from "./reconcile.ts";
import { statementMonthKey } from "./installments.ts";

export interface DraftTransaction {
  postedOn: string;
  descriptionRaw: string;
  descriptionClean: string;
  amountCents: number;
  amountUsdCents: number | null;
  fxRate: number | null;
  installmentN: number | null;
  installmentTotal: number | null;
  kind: ParsedTransaction["kind"];
  section: ParsedTransaction["section"];
  cardLast4: string | null;
  purchaseFlag: string | null;
  categoryId: number | null;
  categorySource: "rule" | "merchant" | "heuristic" | "manual" | "none";
  confidence: "alta" | "media" | "baixa";
  needsReview: boolean;
  ownerUserId: string | null;
  merchantName: string | null;
  dedupeHash: string;
}

export interface DraftStatement {
  format: ParsedStatement["format"];
  closingDate: string;
  dueDate: string;
  periodStart: string | null;
  statementMonth: string;
  declaredTotalCents: number;
  declaredPreviousBalanceCents: number | null;
  declaredPaymentsCents: number | null;
  declaredCreditsCents: number | null;
  declaredExpensesCents: number | null;
  declaredExpensesUsdCents: number | null;
  declaredFutureCents: number | null;
  computedTotalCents: number;
  computedFutureCents: number;
  minimumPaymentCents: number | null;
  creditLimitCents: number | null;
  availableLimitCents: number | null;
  bestPurchaseDate: string | null;
  annuityCents: number | null;
  annuityPaidCents: number | null;
  annuityDiscountPercent: number | null;
  product: string | null;
}

export interface Draft {
  statement: DraftStatement;
  transactions: DraftTransaction[];
  reconcile: ReconcileResult;
  warnings: string[];
  reviewCount: number;
}

export interface BuildDraftOptions {
  accountId: string;
  /** final do cartão → user id do dono (ausente/null = "nosso") */
  cardOwners?: Record<string, string | null>;
  categorizeContext?: CategorizeContext;
}

/** Junta tudo: leitura → decodificação → categorização → dono → hash → conferência. */
export function buildDraft(parsed: ParsedStatement, opts: BuildDraftOptions): Draft {
  const reconcile = reconcileParsed(parsed);
  const hashed = assignDedupeHashes(
    opts.accountId,
    parsed.transactions.filter((t) => t.amountCents !== 0 || t.amountUsdCents !== null),
  );

  const idxOf = new Map<ParsedTransaction, number>();
  parsed.transactions.forEach((t, i) => idxOf.set(t, i));

  const transactions: DraftTransaction[] = hashed.map((t) => {
    const cat = categorize({ description: t.descriptionRaw, kind: t.kind }, opts.categorizeContext);
    const parent = t.parentIndex !== null ? parsed.transactions[t.parentIndex] : undefined;
    const decoded = decodeDescription(parent?.descriptionRaw ?? t.descriptionRaw);
    const clean = parent ? `IOF · ${decoded.display}` : decoded.display;
    const cardOwner = t.cardLast4 ? opts.cardOwners?.[t.cardLast4] ?? null : null;
    return {
      postedOn: t.postedOn,
      descriptionRaw: t.descriptionRaw,
      descriptionClean: clean,
      amountCents: t.amountCents,
      amountUsdCents: t.amountUsdCents,
      fxRate: t.fxRate,
      installmentN: t.installmentN,
      installmentTotal: t.installmentTotal,
      kind: t.kind,
      section: t.section,
      cardLast4: t.cardLast4,
      purchaseFlag: t.purchaseFlag,
      categoryId: parent ? categorize({ description: "IOF", kind: "encargo" }, opts.categorizeContext).categoryId : cat.categoryId,
      categorySource: cat.source,
      confidence: parent ? "alta" : cat.confidence,
      needsReview: parent ? false : cat.needsReview,
      ownerUserId: cat.ownerUserId ?? cardOwner,
      merchantName: cat.merchantName,
      dedupeHash: t.dedupeHash,
    };
  });

  const annuity = parsed.annuity[0] ?? null;
  const generic = parsed.format !== "santander_pdf";
  return {
    statement: {
      format: parsed.format,
      closingDate: parsed.closingDate,
      dueDate: parsed.dueDate,
      periodStart: parsed.periodStart,
      statementMonth: statementMonthKey(parsed.dueDate),
      // sem total do banco, o "declarado" é só o calculado (e os campos do resumo ficam vazios)
      declaredTotalCents: parsed.hasDeclaredTotals ? parsed.totalDueCents : reconcile.computedTotalCents,
      declaredPreviousBalanceCents: generic ? null : parsed.summary.previousBalanceCents,
      declaredPaymentsCents: generic ? null : parsed.summary.paymentsCents,
      declaredCreditsCents: generic ? null : parsed.summary.creditsCents,
      declaredExpensesCents: generic ? (parsed.hasDeclaredTotals ? parsed.totalDueCents : null) : parsed.summary.domesticExpensesCents + parsed.summary.foreignExpensesCents,
      declaredExpensesUsdCents: generic ? null : parsed.summary.foreignExpensesUsdCents,
      declaredFutureCents: generic ? null : parsed.futureObligationsCents,
      computedTotalCents: reconcile.computedTotalCents,
      computedFutureCents: reconcile.computedFutureCents,
      minimumPaymentCents: parsed.minimumPaymentCents,
      creditLimitCents: parsed.creditLimitCents,
      availableLimitCents: parsed.availableLimitCents,
      bestPurchaseDate: parsed.bestPurchaseDate,
      annuityCents: annuity?.installmentCents ?? null,
      annuityPaidCents: annuity?.payCents ?? null,
      annuityDiscountPercent: annuity?.discountPercent ?? null,
      product: parsed.product,
    },
    transactions,
    reconcile,
    warnings: parsed.warnings,
    reviewCount: transactions.filter((t) => t.needsReview).length,
  };
}
