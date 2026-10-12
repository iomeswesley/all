import type { IsoDate } from "../dates.ts";

/** Um pedaço de texto do PDF com posição (origem embaixo-esquerda, como no PDF.js). */
export interface PdfTextItem {
  /** página (1-based) */
  p: number;
  x: number;
  y: number;
  /** largura do texto */
  w: number;
  s: string;
}

export type TxKind = "avista" | "parcela" | "estorno" | "encargo" | "pagamento";
export type TxSection = "pagamentos" | "parcelamentos" | "despesas";

export interface ParsedTransaction {
  /** data da compra (para parcelas, a da compra original) */
  postedOn: IsoDate;
  descriptionRaw: string;
  /** centavos em BRL; positivo = gasto, negativo = pagamento/crédito/estorno */
  amountCents: number;
  amountUsdCents: number | null;
  /** cotação do dólar usada (ex.: 5.4733) */
  fxRate: number | null;
  installmentN: number | null;
  installmentTotal: number | null;
  kind: TxKind;
  section: TxSection;
  /** final do cartão (4 dígitos) a que o lançamento pertence */
  cardLast4: string | null;
  /** dígito da coluna "Compra" da fatura, guardado sem interpretar */
  purchaseFlag: string | null;
  /** índice do lançamento "pai" (ex.: IOF de uma compra em dólar) */
  parentIndex: number | null;
}

export interface StatementSummary {
  previousBalanceCents: number;
  domesticExpensesCents: number;
  foreignExpensesCents: number;
  foreignExpensesUsdCents: number;
  paymentsCents: number;
  creditsCents: number;
  balanceCents: number;
}

export interface CardBlockTotal {
  cardLast4: string;
  totalCents: number;
  totalUsdCents: number;
}

/** Formato de origem do arquivo importado. */
export type ImportFormat = "santander_pdf" | "ofx" | "json";

export interface ParsedStatement {
  bank: string;
  /** formato de origem (decide como a conferência é feita) */
  format: ImportFormat;
  /** True quando o arquivo traz um total para conferir (fatura Santander; JSON com declaredTotalCents). OFX não traz. */
  hasDeclaredTotals: boolean;
  product: string | null;
  closingDate: IsoDate;
  dueDate: IsoDate;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  /** "Total a Pagar" do cabeçalho */
  totalDueCents: number;
  minimumPaymentCents: number | null;
  creditLimitCents: number | null;
  availableLimitCents: number | null;
  bestPurchaseDate: IsoDate | null;
  summary: StatementSummary;
  /** "Saldo total consolidado de obrigações futuras" (compras parceladas) */
  futureObligationsCents: number | null;
  cards: { last4: string; holderName: string }[];
  cardTotals: CardBlockTotal[];
  annuity: { cardLast4: string; installmentCents: number; discountPercent: number; reason: string; payCents: number }[];
  transactions: ParsedTransaction[];
  warnings: string[];
}

export class StatementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatementParseError";
  }
}
