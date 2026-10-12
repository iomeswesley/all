// Orquestra a importação de uma fatura já extraída do PDF: leitura → rascunho → gravação.
// Sem dependência de Deno ou Supabase: o acesso a dados entra por `Store` (testável).
import { buildDraft } from "../_shared/core/draft.ts";
import type { CategorizeContext } from "../_shared/core/categorize.ts";
import type { ReconcileResult } from "../_shared/core/reconcile.ts";
import { parseImport, type ImportSource } from "../_shared/core/parsers/index.ts";
import { StatementParseError, type PdfTextItem } from "../_shared/core/parsers/types.ts";

export interface StatementRow {
  household_id: string;
  account_id: string;
  status: "needs_review";
  format: "santander_pdf" | "ofx" | "json";
  closing_date: string;
  due_date: string;
  period_start: string | null;
  product: string | null;
  declared_total_cents: number;
  declared_previous_balance_cents: number | null;
  declared_payments_cents: number | null;
  declared_credits_cents: number | null;
  declared_expenses_cents: number | null;
  declared_expenses_usd_cents: number | null;
  declared_future_cents: number | null;
  computed_total_cents: number;
  computed_future_cents: number;
  reconcile_status: "ok" | "rounding" | "fail" | "unverified";
  reconcile_checks: unknown;
  minimum_payment_cents: number | null;
  credit_limit_cents: number | null;
  available_limit_cents: number | null;
  best_purchase_date: string | null;
  annuity_cents: number | null;
  annuity_paid_cents: number | null;
  annuity_discount_percent: number | null;
  file_path: string;
  file_sha256: string;
  created_by: string;
}

export interface TransactionRow {
  household_id: string;
  account_id: string;
  statement_id: string;
  card_last4: string | null;
  posted_on: string;
  description_raw: string;
  description_clean: string;
  merchant_name: string | null;
  amount_cents: number;
  amount_usd_cents: number | null;
  fx_rate: number | null;
  installment_n: number | null;
  installment_total: number | null;
  kind: string;
  section: string;
  category_id: number | null;
  category_source: string;
  confidence: string;
  needs_review: boolean;
  owner_user_id: string | null;
  purchase_flag: string | null;
  source: "pdf";
  dedupe_hash: string;
}

export interface Store {
  /** Casal do usuário logado. */
  householdId(): Promise<string>;
  findStatementBySha(householdId: string, sha256: string): Promise<{ id: string; status: string } | null>;
  findStatementByDue(householdId: string, accountId: string, dueDate: string): Promise<{ id: string; status: string } | null>;
  deleteStatement(id: string): Promise<void>;
  /** Conta do cartão: a pedida ou a primeira conta de cartão do casal. */
  account(householdId: string, accountId?: string): Promise<{ id: string; kind: "credit_card" | "checking" }>;
  cardOwners(accountId: string): Promise<Record<string, string | null>>;
  categorizeContext(householdId: string): Promise<CategorizeContext>;
  /** Quais destes hashes já existem no casal (lançamentos de outras faturas): para ignorar sobreposição de períodos. */
  existingHashes(householdId: string, hashes: string[]): Promise<Set<string>>;
  insertStatement(row: StatementRow): Promise<string>;
  insertTransactions(rows: TransactionRow[]): Promise<void>;
  upsertCards(rows: { account_id: string; household_id: string; last4: string; label: string | null }[]): Promise<void>;
}

export interface ProcessInput {
  /** o que foi lido do arquivo (PDF → itens de texto; OFX/JSON → texto) */
  source?: ImportSource;
  /** atalho legado: itens de PDF */
  items?: PdfTextItem[];
  sha256: string;
  filePath: string;
  userId: string;
  accountId?: string;
}

export type ProcessResult =
  | { status: "ok"; statementId: string; reconcile: ReconcileResult; reviewCount: number; transactionCount: number; warnings: string[]; replacedDraft: boolean; skippedDuplicates: number }
  | { status: "nothing_new"; skippedDuplicates: number }
  | { status: "overlap_with_total"; skippedDuplicates: number; message: string }
  | { status: "duplicate_file"; statementId: string; confirmed: boolean }
  | { status: "already_confirmed"; statementId: string }
  | { status: "unsupported"; message: string };

export async function processStatement(store: Store, input: ProcessInput): Promise<ProcessResult> {
  const householdId = await store.householdId();

  const sameFile = await store.findStatementBySha(householdId, input.sha256);
  if (sameFile) return { status: "duplicate_file", statementId: sameFile.id, confirmed: sameFile.status === "confirmed" };

  // a conta é lida antes: só leitura, e o tipo dela ajuda a interpretar o OFX
  const account = await store.account(householdId, input.accountId);

  let parsed;
  try {
    const source: ImportSource = input.source ?? { format: "pdf", items: input.items ?? [] };
    parsed = parseImport(source.format === "ofx" ? { ...source, options: { accountKind: account.kind } } : source);
  } catch (e) {
    if (e instanceof StatementParseError) return { status: "unsupported", message: e.message };
    throw e;
  }

  const samePeriod = await store.findStatementByDue(householdId, account.id, parsed.dueDate);
  if (samePeriod?.status === "confirmed") return { status: "already_confirmed", statementId: samePeriod.id };
  if (samePeriod) await store.deleteStatement(samePeriod.id); // rascunho anterior: substitui

  const draft = buildDraft(parsed, {
    accountId: account.id,
    cardOwners: await store.cardOwners(account.id),
    categorizeContext: await store.categorizeContext(householdId),
  });

  // Extratos (OFX/JSON) de períodos que se cruzam trazem lançamentos já importados: ignora os repetidos.
  // Fatura Santander em PDF não se sobrepõe (uma por fechamento); com total declarado não dá para ignorar linhas sem quebrar a conferência.
  let rows = draft.transactions;
  let skipped = 0;
  if (parsed.format !== "santander_pdf") {
    const existing = await store.existingHashes(householdId, rows.map((t) => t.dedupeHash));
    skipped = rows.filter((t) => existing.has(t.dedupeHash)).length;
    if (skipped > 0 && parsed.hasDeclaredTotals) {
      return { status: "overlap_with_total", skippedDuplicates: skipped, message: `${skipped} lançamento(s) deste arquivo já foram importados antes. Como ele traz um total para conferir, importe só o período novo.` };
    }
    rows = rows.filter((t) => !existing.has(t.dedupeHash));
    if (rows.length === 0) return { status: "nothing_new", skippedDuplicates: skipped };
  }

  await store.upsertCards(parsed.cards.map((c) => ({ account_id: account.id, household_id: householdId, last4: c.last4, label: null })));

  const s = draft.statement;
  const statementId = await store.insertStatement({
    household_id: householdId,
    account_id: account.id,
    status: "needs_review",
    format: s.format,
    closing_date: s.closingDate,
    due_date: s.dueDate,
    period_start: s.periodStart,
    product: s.product,
    declared_total_cents: s.declaredTotalCents,
    declared_previous_balance_cents: s.declaredPreviousBalanceCents,
    declared_payments_cents: s.declaredPaymentsCents,
    declared_credits_cents: s.declaredCreditsCents,
    declared_expenses_cents: s.declaredExpensesCents,
    declared_expenses_usd_cents: s.declaredExpensesUsdCents,
    declared_future_cents: s.declaredFutureCents,
    computed_total_cents: s.computedTotalCents,
    computed_future_cents: s.computedFutureCents,
    reconcile_status: draft.reconcile.status,
    reconcile_checks: draft.reconcile.checks,
    minimum_payment_cents: s.minimumPaymentCents,
    credit_limit_cents: s.creditLimitCents,
    available_limit_cents: s.availableLimitCents,
    best_purchase_date: s.bestPurchaseDate,
    annuity_cents: s.annuityCents,
    annuity_paid_cents: s.annuityPaidCents,
    annuity_discount_percent: s.annuityDiscountPercent,
    file_path: input.filePath,
    file_sha256: input.sha256,
    created_by: input.userId,
  });

  try {
    await store.insertTransactions(
      rows.map((t) => ({
        household_id: householdId,
        account_id: account.id,
        statement_id: statementId,
        card_last4: t.cardLast4,
        posted_on: t.postedOn,
        description_raw: t.descriptionRaw,
        description_clean: t.descriptionClean,
        merchant_name: t.merchantName,
        amount_cents: t.amountCents,
        amount_usd_cents: t.amountUsdCents,
        fx_rate: t.fxRate,
        installment_n: t.installmentN,
        installment_total: t.installmentTotal,
        kind: t.kind,
        section: t.section,
        category_id: t.categoryId,
        category_source: t.categorySource,
        confidence: t.confidence,
        needs_review: t.needsReview,
        owner_user_id: t.ownerUserId,
        purchase_flag: t.purchaseFlag,
        source: "pdf" as const,
        dedupe_hash: t.dedupeHash,
      })),
    );
  } catch (e) {
    await store.deleteStatement(statementId); // não deixa fatura pela metade
    throw e;
  }

  return {
    status: "ok",
    statementId,
    reconcile: draft.reconcile,
    reviewCount: draft.reviewCount,
    transactionCount: rows.length,
    warnings: skipped > 0 ? [...draft.warnings, `${skipped} lançamento(s) já importado(s) antes foram ignorados.`] : draft.warnings,
    replacedDraft: samePeriod !== null,
    skippedDuplicates: skipped,
  };
}
