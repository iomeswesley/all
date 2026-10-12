// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { isValidDate, splitIso, type IsoDate } from "../dates.ts";
import { tryParseBRL } from "../money.ts";
import { StatementParseError, type ParsedStatement, type ParsedTransaction, type TxKind } from "./types.ts";

export const JSON_IMPORT_VERSION = 1;

/**
 * Importação assistida: para qualquer banco, a pessoa pede ao próprio Claude para ler a fatura (PDF ou foto)
 * e devolver este JSON; o app valida, confere o total (se informado) e importa. O app nunca chama IA.
 */
export const JSON_IMPORT_PROMPT = `Leia a fatura/extrato que vou anexar e responda SOMENTE com um JSON neste formato (sem texto antes ou depois):

{
  "version": 1,
  "bank": "nome do banco",
  "accountKind": "credit_card",
  "closingDate": "AAAA-MM-DD",
  "dueDate": "AAAA-MM-DD",
  "declaredTotalCents": 123456,
  "transactions": [
    { "date": "AAAA-MM-DD", "description": "texto exato da fatura", "amountCents": 12345, "kind": "avista" }
  ]
}

Regras:
- Valores em CENTAVOS, inteiros (R$ 123,45 = 12345). Compras e cobranças são POSITIVAS; estornos e créditos NEGATIVOS.
- "kind": "avista", "parcela", "estorno", "encargo" (anuidade, IOF, juros, multa, seguro) ou "pagamento" (pagamento da fatura anterior; não é gasto).
- Parcelas: inclua "installmentN" e "installmentTotal" (ex.: parcela 3 de 10) e use a data da compra original.
- Compra em dólar: inclua "usdCents" e, se houver, "fxRate".
- "declaredTotalCents" = o TOTAL A PAGAR impresso na fatura. Se não houver, omita o campo.
- Copie as descrições exatamente como aparecem. Não some, não agrupe, não invente lançamentos.
- Datas sem ano: use o ano coerente com o fechamento da fatura.`;

export interface JsonImportResult {
  statement: ParsedStatement;
}

const KINDS: TxKind[] = ["avista", "parcela", "estorno", "encargo", "pagamento"];

const isoOrNull = (v: unknown): IsoDate | null => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const { y, m, d } = splitIso(v);
  return isValidDate(y, m, d) ? v : null;
};

function cents(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && Number.isSafeInteger(v)) return v;
  if (typeof v === "string") return tryParseBRL(v);
  return null;
}

/** Valida e converte o JSON colado. Erros em português, apontando a linha problemática. */
export function parseJsonImport(text: string): ParsedStatement {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    throw new StatementParseError("O texto colado não é um JSON válido. Peça ao Claude para responder só com o JSON.");
  }
  if (typeof raw !== "object" || raw === null) throw new StatementParseError("O JSON precisa ser um objeto.");
  const o = raw as Record<string, unknown>;
  if (o.version !== JSON_IMPORT_VERSION) throw new StatementParseError(`Versão do formato não suportada (esperado "version": ${JSON_IMPORT_VERSION}).`);

  const closing = isoOrNull(o.closingDate);
  if (!closing) throw new StatementParseError('"closingDate" ausente ou inválida (use AAAA-MM-DD).');
  const due = o.dueDate === undefined ? closing : isoOrNull(o.dueDate);
  if (!due) throw new StatementParseError('"dueDate" inválida (use AAAA-MM-DD).');
  if (!Array.isArray(o.transactions) || o.transactions.length === 0) throw new StatementParseError('"transactions" precisa ser uma lista com pelo menos 1 lançamento.');
  if (o.transactions.length > 2000) throw new StatementParseError("Lançamentos demais (máximo 2000).");

  const problems: string[] = [];
  const txs: ParsedTransaction[] = [];
  o.transactions.forEach((item, i) => {
    const t = (item ?? {}) as Record<string, unknown>;
    const where = `Lançamento ${i + 1}`;
    const date = isoOrNull(t.date);
    const amount = cents(t.amountCents ?? t.amount);
    const description = typeof t.description === "string" ? t.description.trim().replace(/\s+/g, " ") : "";
    if (!date) return void problems.push(`${where}: data inválida.`);
    if (amount === null) return void problems.push(`${where}: valor inválido (use centavos inteiros).`);
    if (!description) return void problems.push(`${where}: sem descrição.`);
    if (date > closing && date > due) return void problems.push(`${where}: data depois do fechamento/vencimento.`);

    let kind: TxKind = KINDS.includes(t.kind as TxKind) ? (t.kind as TxKind) : amount < 0 ? "estorno" : "avista";
    const n = typeof t.installmentN === "number" ? t.installmentN : null;
    const total = typeof t.installmentTotal === "number" ? t.installmentTotal : null;
    const hasInst = n !== null && total !== null && Number.isInteger(n) && Number.isInteger(total) && n >= 1 && total >= n;
    if (hasInst && total! > 1 && kind === "avista") kind = "parcela";
    if (kind === "parcela" && !hasInst) return void problems.push(`${where}: parcela sem installmentN/installmentTotal válidos.`);
    if (kind === "pagamento" && amount > 0) return void problems.push(`${where}: pagamento deve ter valor negativo.`);
    if (kind === "estorno" && amount > 0) return void problems.push(`${where}: estorno deve ter valor negativo.`);
    if (kind !== "pagamento" && kind !== "estorno" && amount < 0) return void problems.push(`${where}: valor negativo só para estorno/pagamento.`);

    const usd = t.usdCents === undefined ? null : cents(t.usdCents);
    const fx = typeof t.fxRate === "number" && t.fxRate > 0 ? t.fxRate : null;
    txs.push({
      postedOn: date,
      descriptionRaw: description,
      amountCents: amount,
      amountUsdCents: usd,
      fxRate: fx,
      installmentN: kind === "parcela" ? n : null,
      installmentTotal: kind === "parcela" ? total : null,
      kind,
      section: kind === "pagamento" || kind === "estorno" ? "pagamentos" : kind === "parcela" ? "parcelamentos" : "despesas",
      cardLast4: typeof t.cardLast4 === "string" && /^\d{4}$/.test(t.cardLast4) ? t.cardLast4 : null,
      purchaseFlag: null,
      parentIndex: null,
    });
  });
  if (problems.length) throw new StatementParseError(`${problems.slice(0, 5).join(" ")}${problems.length > 5 ? ` (e mais ${problems.length - 5} problemas)` : ""}`);

  const declared = o.declaredTotalCents === undefined ? null : cents(o.declaredTotalCents);
  if (o.declaredTotalCents !== undefined && declared === null) throw new StatementParseError('"declaredTotalCents" inválido.');
  const warnings: string[] = [];
  if (declared === null) warnings.push("Sem total declarado: não há como conferir a soma. Confira os valores antes de confirmar.");

  const last4 = [...new Set(txs.map((t) => t.cardLast4).filter((x): x is string => !!x))];
  return {
    bank: typeof o.bank === "string" && o.bank.trim() ? o.bank.trim().slice(0, 40) : "importação",
    format: "json",
    hasDeclaredTotals: declared !== null,
    product: "Importação assistida (JSON)",
    closingDate: closing,
    dueDate: due,
    periodStart: null,
    periodEnd: closing,
    totalDueCents: declared ?? 0,
    minimumPaymentCents: null,
    creditLimitCents: null,
    availableLimitCents: null,
    bestPurchaseDate: null,
    summary: { previousBalanceCents: 0, domesticExpensesCents: 0, foreignExpensesCents: 0, foreignExpensesUsdCents: 0, paymentsCents: 0, creditsCents: 0, balanceCents: 0 },
    futureObligationsCents: null,
    cards: last4.map((l) => ({ last4: l, holderName: "" })),
    cardTotals: [],
    annuity: [],
    transactions: txs,
    warnings,
  };
}
