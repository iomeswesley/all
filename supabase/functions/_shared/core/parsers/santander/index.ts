// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { inferDate, parseBrDate, parseBrDateShort, type IsoDate } from "../../dates.ts";
import { looksLikeBRL, parseBRL } from "../../money.ts";
import { pagesOf, readingOrder, toRows, type Row } from "../layout.ts";
import {
  StatementParseError,
  type CardBlockTotal,
  type ParsedStatement,
  type ParsedTransaction,
  type PdfTextItem,
  type StatementSummary,
  type TxKind,
  type TxSection,
} from "../types.ts";

/** Deslocamento horizontal da coluna direita em relação à esquerda (mesma tabela, 293 pt). */
const RIGHT_COLUMN_SHIFT = 293;
/** x do cabeçalho "US$" na coluna esquerda. Valores em US$ começam a partir daqui (com folga). */
const USD_X_LEFT = 242;
const USD_SLACK = 8;

const CARD_HEADER = /^(?:@\s*)?(.+?)\s+-\s+\d{4}\s+X{4}\s+X{4}\s+(\d{4})$/;
const TX_DATE_DESC = /^(\d{2})\/(\d{2})\s+(.+)$/;
const INSTALLMENT = /^(\d{2})\/(\d{2})$/;
const ENCARGO = /\b(ANUIDADE|IOF|JUROS|MULTA|MORA|SEGURO|TARIFA|ENCARGO|PREST(AMISTA)?|COBRANCA)\b/i;
const PAYMENT = /PAGAMENTO\s+(DE\s+)?FATURA|PAGTO|PAGAMENTO\s+(EFETUADO|RECEBIDO|ANTECIPADO)/i;

export function isSantanderStatement(items: readonly PdfTextItem[]): boolean {
  const page1 = items.filter((i) => i.p === 1).map((i) => i.s).join(" ");
  return /SANTANDER/i.test(page1) && /Detalhamento da Fatura/i.test(items.map((i) => i.s).join(" "));
}

export function parseSantanderStatement(items: readonly PdfTextItem[]): ParsedStatement {
  if (!isSantanderStatement(items)) {
    throw new StatementParseError("O PDF não parece ser uma fatura Santander (texto não encontrado).");
  }
  const warnings: string[] = [];
  const header = parseHeader(items, warnings);
  const body = parseBody(items, header.closingDate, warnings);
  if (body.summary === null) throw new StatementParseError('Resumo da fatura ("Saldo Desta Fatura") não encontrado.');

  if (header.totalDueCents !== body.summary.balanceCents) {
    warnings.push("O 'Total a Pagar' do cabeçalho difere do 'Saldo Desta Fatura' do resumo.");
  }
  return {
    bank: "santander",
    format: "santander_pdf",
    hasDeclaredTotals: true,
    product: header.product,
    closingDate: header.closingDate,
    dueDate: header.dueDate,
    periodStart: header.periodStart,
    periodEnd: header.periodEnd,
    totalDueCents: header.totalDueCents,
    minimumPaymentCents: header.minimumPaymentCents,
    creditLimitCents: header.creditLimitCents,
    availableLimitCents: header.availableLimitCents,
    bestPurchaseDate: header.bestPurchaseDate,
    summary: body.summary,
    futureObligationsCents: body.futureObligationsCents,
    cards: body.cards,
    cardTotals: body.cardTotals,
    annuity: header.annuity,
    transactions: body.transactions,
    warnings,
  };
}

// ───────────────────────── Página 1: cabeçalho ─────────────────────────

function valueBelow(items: readonly PdfTextItem[], labelTest: (s: string) => boolean, test: (s: string) => boolean = looksMoneyOrDate): string | null {
  const label = items.find((i) => labelTest(i.s.trim()));
  if (!label) return null;
  const candidates = items
    .filter((i) => i.y < label.y - 2 && label.y - i.y < 30 && Math.abs(i.x - label.x) < 45 && test(i.s.trim()))
    .sort((a, b) => b.y - a.y);
  return candidates[0]?.s.trim() ?? null;
}

const looksMoneyOrDate = (s: string) => /^R\$\s?[\d.]+,\d{2}$/.test(s) || /^\d{2}\/\d{2}\/\d{4}$/.test(s);

function moneyOf(s: string | null): number | null {
  return s ? parseBRL(s) : null;
}

function parseHeader(all: readonly PdfTextItem[], warnings: string[]) {
  const p1 = all.filter((i) => i.p === 1);

  const totalDue = moneyOf(valueBelow(p1, (s) => s === "Total a Pagar"));
  const dueText = valueBelow(p1, (s) => s === "Vencimento");
  if (totalDue === null) throw new StatementParseError('"Total a Pagar" não encontrado na primeira página.');
  if (!dueText) throw new StatementParseError('"Vencimento" não encontrado na primeira página.');

  const creditLimit = moneyOf(valueBelow(p1, (s) => /^Seu lim/i.test(s)));
  const available = moneyOf(valueBelow(p1, (s) => /^Limite Dispon/i.test(s)));

  const rightPanel = toRows(p1.filter((i) => i.x >= 280));
  const leftText = toRows(p1.filter((i) => i.x < 280)).map((r) => r.text).join(" ");

  const product = /cart[ãa]o\s+(.+?)\s+contendo/i.exec(leftText)?.[1]?.trim() ?? null;

  const minRow = toRows(p1.filter((i) => i.x < 280)).find((r) => /^2 Pagamento M[ií]nimo/i.test(r.text));
  const minimumPaymentCents = minRow ? moneyOf(/R\$\s?([\d.]+,\d{2})/.exec(minRow.text)?.[1] ?? null) : null;

  const thisRow = rightPanel.find((r) => /Esta Fatura/i.test(r.text) && /\d{2}\/\d{2}\/\d{2}\s+a\s+\d{2}\/\d{2}\/\d{2}/.test(r.text));
  const period = thisRow ? /(\d{2}\/\d{2}\/\d{2})\s+a\s+(\d{2}\/\d{2}\/\d{2})/.exec(thisRow.text) : null;
  const periodStart = period ? parseBrDateShort(period[1]!) : null;
  const periodEnd = period ? parseBrDateShort(period[2]!) : null;
  if (!periodEnd) warnings.push('Período da fatura ("Esta Fatura") não encontrado; usando o vencimento para inferir datas.');
  const dueDate = parseBrDate(dueText);

  const bestItem = p1.find((i) => /^\d{2}\/\d{2}\/\d{4}$/.test(i.s.trim()) && i.x > 480 && i.y > 600);
  const bestPurchaseDate = bestItem ? parseBrDate(bestItem.s.trim()) : null;

  const annuity: ParsedStatement["annuity"] = [];
  for (const r of rightPanel) {
    const m = /\b(\d{4})\s+R\$\s?([\d.]+,\d{2})\s+([\d.]+,\d{2})%\s+(.*?)\s+R\$\s?([\d.]+,\d{2})$/.exec(r.text);
    if (m) {
      annuity.push({
        cardLast4: m[1]!,
        installmentCents: parseBRL(m[2]!),
        discountPercent: Number(m[3]!.replace(",", ".")),
        reason: m[4]!,
        payCents: parseBRL(m[5]!),
      });
    }
  }

  return {
    product,
    totalDueCents: totalDue,
    dueDate,
    closingDate: periodEnd ?? dueDate,
    periodStart,
    periodEnd,
    minimumPaymentCents,
    creditLimitCents: creditLimit,
    availableLimitCents: available,
    bestPurchaseDate,
    annuity,
  };
}

// ───────────────────────── Páginas 2+: lançamentos e resumo ─────────────────────────

interface BodyResult {
  transactions: ParsedTransaction[];
  summary: StatementSummary | null;
  futureObligationsCents: number | null;
  cards: { last4: string; holderName: string }[];
  cardTotals: CardBlockTotal[];
}

function parseBody(items: readonly PdfTextItem[], closing: IsoDate, warnings: string[]): BodyResult {
  const transactions: ParsedTransaction[] = [];
  const cards: BodyResult["cards"] = [];
  const cardTotals: CardBlockTotal[] = [];
  const summaryParts: Partial<Record<keyof StatementSummary, number>> = {};
  let futureObligationsCents: number | null = null;

  let card: string | null = null;
  let section: TxSection | null = null;
  let afterSummary = false;
  let expectFuture = false;
  let lastForeignIndex: number | null = null;

  for (const page of pagesOf(items)) {
    if (page === 1) continue;
    for (const { row, column } of readingOrder(items, page)) {
      const text = row.text;
      if (!text) continue;

      const cardHeader = CARD_HEADER.exec(text);
      if (cardHeader) {
        card = cardHeader[2]!;
        section = null;
        if (!cards.some((c) => c.last4 === card)) cards.push({ last4: card, holderName: cardHeader[1]!.trim() });
        continue;
      }
      if (/^Pagamento e Demais Cr[ée]ditos$/i.test(text)) { section = "pagamentos"; continue; }
      if (/^Parcelamentos$/i.test(text)) { section = "parcelamentos"; continue; }
      if (/^Despesas$/i.test(text)) { section = "despesas"; continue; }
      if (/^Resumo da Fatura/i.test(text)) { afterSummary = true; section = null; continue; }
      if (/obriga[çc][õo]es futuras/i.test(text)) { expectFuture = true; continue; }

      const usdFrom = USD_X_LEFT + (column === 1 ? RIGHT_COLUMN_SHIFT : 0) - USD_SLACK;
      const numbers = row.items.filter((i) => looksLikeBRL(i.s));
      const brl = numbers.filter((i) => i.x < usdFrom).map((i) => parseBRL(i.s));
      const usd = numbers.filter((i) => i.x >= usdFrom).map((i) => parseBRL(i.s));

      // ── Resumo da fatura
      if (afterSummary) {
        const first = brl[0] ?? null;
        const set = (k: keyof StatementSummary, v: number | null | undefined) => { if (v !== null && v !== undefined) summaryParts[k] = v; };
        if (/^Saldo Anterior/i.test(text)) set("previousBalanceCents", first);
        else if (/Total Despesas\/D[ée]bitos no Brasil/i.test(text)) set("domesticExpensesCents", first);
        else if (/Total Despesas\/D[ée]bitos no Exterior/i.test(text)) { set("foreignExpensesCents", first); set("foreignExpensesUsdCents", usd[0] ?? 0); }
        else if (/Total de pagamentos/i.test(text)) set("paymentsCents", first);
        else if (/Total de cr[ée]ditos/i.test(text)) set("creditsCents", first);
        else if (/Saldo Desta Fatura/i.test(text)) set("balanceCents", first);
        else if (expectFuture && /^Compras parceladas/i.test(text)) { futureObligationsCents = first; expectFuture = false; }
        continue;
      }

      // ── Total do bloco do cartão
      if (/^VALOR TOTAL/i.test(text)) {
        if (card !== null && brl.length > 0) cardTotals.push({ cardLast4: card, totalCents: brl[0]!, totalUsdCents: usd[0] ?? 0 });
        section = null;
        continue;
      }

      if (section === null) continue;

      // ── Linhas auxiliares de compra em dólar
      const fx = /COTA[ÇC][ÃA]O\s+D[ÓO]LAR\s+R\$\s*([\d.,]+)/i.exec(text);
      if (fx) {
        if (lastForeignIndex !== null) transactions[lastForeignIndex]!.fxRate = Number(fx[1]!.replace(/\./g, "").replace(",", "."));
        else warnings.push("Cotação do dólar sem compra em dólar associada.");
        continue;
      }
      if (/^IOF\s+DESPESA\s+NO\s+EXTERIOR/i.test(text)) {
        if (lastForeignIndex === null || brl[0] === undefined) { warnings.push("Linha de IOF sem compra em dólar associada."); continue; }
        const parent = transactions[lastForeignIndex]!;
        transactions.push({
          postedOn: parent.postedOn,
          descriptionRaw: "IOF DESPESA NO EXTERIOR",
          amountCents: brl[0],
          amountUsdCents: null,
          fxRate: null,
          installmentN: null,
          installmentTotal: null,
          kind: "encargo",
          section,
          cardLast4: parent.cardLast4,
          purchaseFlag: null,
          parentIndex: lastForeignIndex,
        });
        continue;
      }

      // ── Lançamento
      const dateItem = row.items.find((i) => TX_DATE_DESC.test(i.s.trim()));
      if (!dateItem) continue;
      const dm = TX_DATE_DESC.exec(dateItem.s.trim())!;
      const day = Number(dm[1]);
      const month = Number(dm[2]);
      const description = dm[3]!.trim();

      const flagItem = row.items.find((i) => /^\d$/.test(i.s.trim()) && i.x < dateItem.x);
      const instItem = row.items.find((i) => INSTALLMENT.test(i.s.trim()) && i.x > dateItem.x);
      const inst = instItem ? INSTALLMENT.exec(instItem.s.trim())! : null;
      const n = inst ? Number(inst[1]) : null;
      const total = inst ? Number(inst[2]) : null;

      if (brl.length === 0) {
        warnings.push(`Linha sem valor em R$ ignorada: "${text}"`);
        continue;
      }
      const amountCents = brl[0]!;
      const kind = classify(section, description, amountCents, total);
      const isInstallment = kind === "parcela";

      let postedOn: IsoDate;
      try {
        postedOn = inferDate(day, month, closing, isInstallment ? n ?? undefined : undefined);
      } catch {
        warnings.push(`Data inválida em "${text}"`);
        continue;
      }

      transactions.push({
        postedOn,
        descriptionRaw: description,
        amountCents,
        amountUsdCents: usd[0] ?? null,
        fxRate: null,
        installmentN: isInstallment ? n : null,
        installmentTotal: isInstallment ? total : null,
        kind,
        section,
        cardLast4: card,
        purchaseFlag: flagItem ? flagItem.s.trim() : null,
        parentIndex: null,
      });
      lastForeignIndex = usd[0] !== undefined ? transactions.length - 1 : null;
    }
  }

  const need = ["previousBalanceCents", "domesticExpensesCents", "foreignExpensesCents", "paymentsCents", "creditsCents", "balanceCents"] as const;
  const missing = need.filter((k) => summaryParts[k] === undefined);
  const summary: StatementSummary | null = missing.length === need.length
    ? null
    : {
        previousBalanceCents: summaryParts.previousBalanceCents ?? 0,
        domesticExpensesCents: summaryParts.domesticExpensesCents ?? 0,
        foreignExpensesCents: summaryParts.foreignExpensesCents ?? 0,
        foreignExpensesUsdCents: summaryParts.foreignExpensesUsdCents ?? 0,
        paymentsCents: summaryParts.paymentsCents ?? 0,
        creditsCents: summaryParts.creditsCents ?? 0,
        balanceCents: summaryParts.balanceCents ?? 0,
      };
  if (summary && missing.length > 0) warnings.push(`Campos do resumo não encontrados: ${missing.join(", ")}`);

  return { transactions, summary, futureObligationsCents, cards, cardTotals };
}

function classify(section: TxSection, description: string, amountCents: number, installmentTotal: number | null): TxKind {
  if (section === "pagamentos") return PAYMENT.test(description) ? "pagamento" : "estorno";
  if (ENCARGO.test(description)) return "encargo";
  if (section === "parcelamentos") return "parcela";
  if (installmentTotal !== null && installmentTotal > 1) return "parcela";
  if (amountCents < 0) return "estorno";
  return "avista";
}

export type { Row };
