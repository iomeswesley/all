// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { isValidDate, isoDate, type IsoDate } from "../dates.ts";
import { StatementParseError, type ParsedStatement, type ParsedTransaction } from "./types.ts";

/** "1.234,56", "-12.50", "12,5" → centavos (sem float). */
export function parseOfxAmount(raw: string): number {
  let s = raw.trim().replace(/\s+/g, "").replace(/^\+/, "");
  const neg = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"));
  s = s.replace(/^[-(]+|\)$/g, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const sep = Math.max(lastDot, lastComma);
  let intPart = s;
  let dec = "";
  // o último separador é decimal quando tem 1–2 dígitos depois dele
  if (sep >= 0 && s.length - sep - 1 <= 2 && s.length - sep - 1 >= 1) {
    intPart = s.slice(0, sep);
    dec = s.slice(sep + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d+$/.test(intPart || "0") || (dec && !/^\d+$/.test(dec))) throw new StatementParseError(`Valor inválido no OFX: "${raw}"`);
  const cents = Number(intPart || "0") * 100 + Number(dec.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new StatementParseError(`Valor fora do limite no OFX: "${raw}"`);
  return neg ? -cents : cents;
}

/** "20261012", "20261012120000[-3:BRT]" → "2026-10-12". */
export function parseOfxDate(raw: string): IsoDate {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  if (!m) throw new StatementParseError(`Data inválida no OFX: "${raw}"`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isValidDate(y, mo, d)) throw new StatementParseError(`Data inexistente no OFX: "${raw}"`);
  return isoDate(y, mo, d);
}

const tag = (block: string, name: string): string | null => {
  // SGML (sem fechamento) ou XML: o valor vai até a próxima tag ou quebra de linha
  const m = new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, "i").exec(block);
  const v = m?.[1]?.trim();
  return v ? decodeEntities(v) : null;
};

const decodeEntities = (s: string) => s.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");

const PAYMENT = /PAGAMENTO|PAGTO|PGTO|PAG\.?\s*FATURA|PAGAMENTO\s+RECEBIDO/i;
const ENCARGO = /\b(ANUIDADE|IOF|JUROS|MULTA|MORA|SEGURO|TARIFA|ENCARGO)\b/i;
const INSTALLMENT = /(?:PARC(?:ELA)?\.?\s*)(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})|\b(\d{1,2})\/(\d{1,2})\s*$/i;

export interface OfxOptions {
  /** tipo da conta no app, usado só se o arquivo não disser (CCSTMTRS = cartão; STMTRS = conta) */
  accountKind?: "credit_card" | "checking";
}

/** Lê um extrato OFX (cartão ou conta corrente), SGML 1.x ou XML 2.x. */
export function parseOfx(text: string, opts: OfxOptions = {}): ParsedStatement {
  const body = text.slice(Math.max(text.search(/<OFX>/i), 0));
  if (!/<OFX>/i.test(body) || !/<STMTTRN>/i.test(body)) throw new StatementParseError("O arquivo não parece um extrato OFX (sem <OFX> ou lançamentos).");

  const currency = tag(body, "CURDEF");
  if (currency && currency.toUpperCase() !== "BRL") throw new StatementParseError(`Moeda ${currency} não suportada (só BRL).`);

  const isCard = /<CCSTMTRS>/i.test(body) ? true : /<STMTRS>/i.test(body) ? false : opts.accountKind === "credit_card";
  const warnings: string[] = [];
  if (opts.accountKind && (opts.accountKind === "credit_card") !== isCard) warnings.push(`O arquivo é de ${isCard ? "cartão" : "conta corrente"}, diferente do tipo da conta escolhida.`);

  const acct = tag(body, "ACCTID") ?? "";
  const digits = acct.replace(/\D/g, "");
  const cardLast4 = digits.length >= 4 ? digits.slice(-4) : null;

  const blocks = [...body.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/CREDITCARDMSGSRSV1>|$)/gi)].map((m) => m[1]!);
  const txs: ParsedTransaction[] = [];
  for (const b of blocks) {
    const dt = tag(b, "DTPOSTED");
    const amt = tag(b, "TRNAMT");
    if (!dt || !amt) {
      warnings.push("Lançamento sem data ou valor ignorado.");
      continue;
    }
    const name = tag(b, "NAME");
    const memo = tag(b, "MEMO");
    const description = [name, memo && memo !== name && !(name ?? "").includes(memo) ? memo : null].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || "SEM DESCRICAO";
    const ofxAmount = parseOfxAmount(amt);
    const amountCents = -ofxAmount; // OFX: débito negativo → no app, gasto positivo
    if (amountCents === 0) continue;

    let kind: ParsedTransaction["kind"];
    if (amountCents > 0) kind = ENCARGO.test(description) ? "encargo" : "avista";
    else if (isCard) kind = PAYMENT.test(description) ? "pagamento" : "estorno";
    else kind = "pagamento"; // entrada em conta corrente: não é gasto
    const inst = kind === "avista" ? INSTALLMENT.exec(description) : null;
    const n = inst ? Number(inst[1] ?? inst[3]) : null;
    const total = inst ? Number(inst[2] ?? inst[4]) : null;
    const isInstallment = n !== null && total !== null && total > 1 && n >= 1 && n <= total;
    if (isInstallment) kind = "parcela";

    txs.push({
      postedOn: parseOfxDate(dt),
      descriptionRaw: description,
      amountCents,
      amountUsdCents: null,
      fxRate: null,
      installmentN: isInstallment ? n : null,
      installmentTotal: isInstallment ? total : null,
      kind,
      section: kind === "pagamento" || kind === "estorno" ? "pagamentos" : "despesas",
      cardLast4,
      purchaseFlag: null,
      parentIndex: null,
    });
  }
  if (txs.length === 0) throw new StatementParseError("Nenhum lançamento encontrado no OFX.");

  const dates = txs.map((t) => t.postedOn).sort();
  const dtEnd = tag(body, "DTEND");
  const dtStart = tag(body, "DTSTART");
  const closing = dtEnd ? parseOfxDate(dtEnd) : dates[dates.length - 1]!;
  warnings.push("OFX não traz o total da fatura: não há como conferir a soma. Confira os valores antes de confirmar.");
  return {
    bank: tag(body, "ORG") ?? tag(body, "BANKID") ?? "ofx",
    format: "ofx",
    hasDeclaredTotals: false,
    product: isCard ? "Cartão (OFX)" : "Conta corrente (OFX)",
    closingDate: closing,
    dueDate: closing,
    periodStart: dtStart ? parseOfxDate(dtStart) : dates[0]!,
    periodEnd: closing,
    totalDueCents: 0,
    minimumPaymentCents: null,
    creditLimitCents: null,
    availableLimitCents: null,
    bestPurchaseDate: null,
    summary: { previousBalanceCents: 0, domesticExpensesCents: 0, foreignExpensesCents: 0, foreignExpensesUsdCents: 0, paymentsCents: 0, creditsCents: 0, balanceCents: 0 },
    futureObligationsCents: null,
    cards: cardLast4 ? [{ last4: cardLast4, holderName: "" }] : [],
    cardTotals: [],
    annuity: [],
    transactions: txs,
    warnings,
  };
}

/** Bytes de um arquivo OFX → texto. Bancos brasileiros costumam usar Windows-1252/ISO-8859-1. */
export function decodeOfxBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
