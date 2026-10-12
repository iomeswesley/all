import { describe, expect, it } from "vitest";
import { buildDraft } from "../src/draft.ts";
import { JSON_IMPORT_PROMPT, parseJsonImport } from "../src/parsers/json-import.ts";
import { detectFormatFromName, parseImport } from "../src/parsers/index.ts";
import { decodeOfxBytes, parseOfx, parseOfxAmount, parseOfxDate } from "../src/parsers/ofx.ts";
import { StatementParseError } from "../src/parsers/types.ts";
import { reconcileGeneric, reconcileParsed } from "../src/reconcile.ts";

/** OFX 1.x (SGML, sem tags de fechamento) de cartão de crédito. */
const OFX_CARD = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261012120000[-3:BRT]<LANGUAGE>POR<FI><ORG>Banco Exemplo<FID>999</FI></SONRS></SIGNONMSGSRSV1>
<CREDITCARDMSGSRSV1><CCSTMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<CCSTMTRS><CURDEF>BRL
<CCACCTFROM><ACCTID>5555 **** **** 4321</CCACCTFROM>
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905120000[-3:BRT]<TRNAMT>-45.90<FITID>A1<MEMO>MERCADO BOM PRECO
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260906<TRNAMT>-1.234,50<FITID>A2<NAME>LOJA XPTO<MEMO>PARC 03/10
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260907<TRNAMT>-45.90<FITID>A3<MEMO>MERCADO BOM PRECO
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260907<TRNAMT>-45.90<FITID>A4<MEMO>MERCADO BOM PRECO
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910<TRNAMT>-87.50<FITID>A5<MEMO>ANUIDADE DIFERENCIADA
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260912<TRNAMT>20.00<FITID>A6<MEMO>ESTORNO LOJA XPTO
</STMTTRN>
<STMTTRN><TRNTYPE>PAYMENT<DTPOSTED>20260915<TRNAMT>500.00<FITID>A7<MEMO>PAGAMENTO FATURA
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>-1500.00<DTASOF>20260930</LEDGERBAL>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

/** OFX 2.x (XML) de conta corrente, com entidades. */
const OFX_BANK = `<?xml version="1.0" encoding="UTF-8"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL</CURDEF>
<BANKACCTFROM><BANKID>001</BANKID><ACCTID>12345-6</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001</DTSTART><DTEND>20261031</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261003</DTPOSTED><TRNAMT>-120.00</TRNAMT><FITID>B1</FITID><MEMO>PIX ENVIADO PADARIA &amp; CIA</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261005</DTPOSTED><TRNAMT>8500.00</TRNAMT><FITID>B2</FITID><MEMO>SALARIO</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261010</DTPOSTED><TRNAMT>-39.90</TRNAMT><FITID>B3</FITID><MEMO>TARIFA MENSAL</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("OFX: valores e datas", () => {
  it.each([["-45.90", -4590], ["1.234,50", 123450], ["12,5", 1250], ["+7", 700], ["(10.00)", -1000], ["-1,234.56", -123456], ["100", 10000]])("%s → %i", (raw, cents) => expect(parseOfxAmount(raw)).toBe(cents));
  it("rejeita lixo", () => expect(() => parseOfxAmount("abc")).toThrow(StatementParseError));
  it("datas com hora e fuso", () => {
    expect(parseOfxDate("20261012120000[-3:BRT]")).toBe("2026-10-12");
    expect(() => parseOfxDate("20261312")).toThrow(StatementParseError);
  });
});

describe("OFX de cartão (SGML)", () => {
  const st = parseOfx(OFX_CARD);
  it("lê período, final do cartão e tipos", () => {
    expect(st).toMatchObject({ format: "ofx", hasDeclaredTotals: false, closingDate: "2026-09-30", periodStart: "2026-09-01" });
    expect(st.cards).toEqual([{ last4: "4321", holderName: "" }]);
    expect(st.transactions).toHaveLength(7);
  });
  it("gasto positivo; parcela, encargo, estorno e pagamento classificados", () => {
    const by = (d: string) => st.transactions.find((t) => t.descriptionRaw.includes(d))!;
    expect(by("MERCADO")).toMatchObject({ amountCents: 4590, kind: "avista", postedOn: "2026-09-05" });
    expect(by("LOJA XPTO PARC")).toMatchObject({ amountCents: 123450, kind: "parcela", installmentN: 3, installmentTotal: 10 });
    expect(by("ANUIDADE")).toMatchObject({ kind: "encargo", amountCents: 8750 });
    expect(by("ESTORNO")).toMatchObject({ kind: "estorno", amountCents: -2000, section: "pagamentos" });
    expect(by("PAGAMENTO")).toMatchObject({ kind: "pagamento", amountCents: -50000 });
  });
  it("não dá para conferir: avisa e fica 'unverified'", () => {
    const r = reconcileParsed(st);
    expect(r.status).toBe("unverified");
    expect(r.canAutoConfirm).toBe(true);
    expect(st.warnings.join(" ")).toMatch(/não traz o total/);
  });
  it("compras idênticas no mesmo dia não colapsam no rascunho", () => {
    const d = buildDraft(st, { accountId: "a" });
    const merc = d.transactions.filter((t) => t.descriptionRaw.includes("MERCADO"));
    expect(merc).toHaveLength(3);
    expect(new Set(merc.map((t) => t.dedupeHash)).size).toBe(3);
    expect(d.statement).toMatchObject({ format: "ofx", declaredPaymentsCents: null, declaredFutureCents: null });
    expect(d.statement.declaredTotalCents).toBe(d.statement.computedTotalCents);
  });
});

describe("OFX de conta corrente (XML)", () => {
  const st = parseOfx(OFX_BANK, { accountKind: "checking" });
  it("entrada não é gasto; entidades XML decodificadas; competência pelo fim do período", () => {
    expect(st.closingDate).toBe("2026-10-31");
    expect(st.transactions.map((t) => [t.kind, t.amountCents])).toEqual([["avista", 12000], ["pagamento", -850000], ["encargo", 3990]]);
    expect(st.transactions[0]!.descriptionRaw).toBe("PIX ENVIADO PADARIA & CIA");
    expect(st.cards[0]!.last4).toBe("3456");
    const d = buildDraft(st, { accountId: "a" });
    expect(d.transactions.find((t) => t.kind === "pagamento")!.categoryId).toBeNull();
  });
  it("avisa quando o tipo do arquivo difere da conta escolhida", () => {
    expect(parseOfx(OFX_BANK, { accountKind: "credit_card" }).warnings.join(" ")).toMatch(/conta corrente, diferente/);
  });
});

describe("OFX inválido", () => {
  it("recusa o que não é OFX, moeda estrangeira e arquivo vazio", () => {
    expect(() => parseOfx("qualquer coisa")).toThrow(/não parece um extrato OFX/);
    expect(() => parseOfx(OFX_CARD.replace("<CURDEF>BRL", "<CURDEF>USD"))).toThrow(/Moeda USD/);
    expect(() => parseOfx("<OFX><BANKTRANLIST><STMTTRN></STMTTRN></BANKTRANLIST></OFX>")).toThrow(/Nenhum lançamento/);
  });
  it("decodifica Windows-1252 quando não é UTF-8", () => {
    const bytes = Uint8Array.from([...Buffer.from("AÇAÍ", "latin1")]);
    expect(decodeOfxBytes(bytes)).toBe("AÇAÍ");
    expect(decodeOfxBytes(new TextEncoder().encode("AÇAÍ"))).toBe("AÇAÍ");
  });
});

const goodJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1, bank: "Banco X", accountKind: "credit_card", closingDate: "2026-09-30", dueDate: "2026-10-07", declaredTotalCents: 10000,
    transactions: [
      { date: "2026-09-05", description: "MERCADO", amountCents: 7000, kind: "avista" },
      { date: "2026-09-08", description: "LOJA", amountCents: 4000, installmentN: 2, installmentTotal: 5 },
      { date: "2026-09-10", description: "ESTORNO LOJA", amountCents: -1000 },
      { date: "2026-09-12", description: "PAGAMENTO FATURA", amountCents: -50000, kind: "pagamento" },
    ],
    ...over,
  });

describe("importação assistida (JSON)", () => {
  it("converte e CONFERE o total informado (compras − estornos; pagamento fora)", () => {
    const st = parseJsonImport(goodJson());
    expect(st).toMatchObject({ format: "json", hasDeclaredTotals: true, totalDueCents: 10000, dueDate: "2026-10-07" });
    expect(st.transactions.map((t) => t.kind)).toEqual(["avista", "parcela", "estorno", "pagamento"]);
    const r = reconcileParsed(st);
    expect(r).toMatchObject({ status: "ok", computedTotalCents: 10000, totalDiffCents: 0 });
    // uma diferença é pega
    const bad = reconcileParsed(parseJsonImport(goodJson({ declaredTotalCents: 10001 })));
    expect(bad).toMatchObject({ status: "fail", canAutoConfirm: false, totalDiffCents: -1 });
  });
  it("sem total declarado: 'unverified'", () => {
    const o = JSON.parse(goodJson());
    delete o.declaredTotalCents;
    expect(reconcileParsed(parseJsonImport(JSON.stringify(o))).status).toBe("unverified");
  });
  it("aceita bloco de código do Claude e valor em texto BRL", () => {
    const o = JSON.parse(goodJson());
    o.transactions[0].amountCents = undefined;
    o.transactions[0].amount = "R$ 70,00";
    const st = parseJsonImport("```json\n" + JSON.stringify(o) + "\n```");
    expect(st.transactions[0]!.amountCents).toBe(7000);
  });
  it.each([
    ["texto solto", "não é json", /não é um JSON válido/],
    ["versão errada", goodJson({ version: 2 }), /Versão/],
    ["sem fechamento", goodJson({ closingDate: undefined }), /closingDate/],
    ["lista vazia", goodJson({ transactions: [] }), /pelo menos 1/],
    ["valor decimal", JSON.stringify({ version: 1, closingDate: "2026-09-30", transactions: [{ date: "2026-09-01", description: "X", amountCents: 12.5 }] }), /valor inválido/],
    ["pagamento positivo", JSON.stringify({ version: 1, closingDate: "2026-09-30", transactions: [{ date: "2026-09-01", description: "X", amountCents: 100, kind: "pagamento" }] }), /pagamento deve ter valor negativo/],
    ["parcela sem número", JSON.stringify({ version: 1, closingDate: "2026-09-30", transactions: [{ date: "2026-09-01", description: "X", amountCents: 100, kind: "parcela" }] }), /installmentN/],
    ["data inexistente", JSON.stringify({ version: 1, closingDate: "2026-09-30", transactions: [{ date: "2026-02-31", description: "X", amountCents: 100 }] }), /data inválida/],
  ])("recusa: %s", (_n, input, re) => expect(() => parseJsonImport(input)).toThrow(re));
  it("o prompt para o Claude descreve o formato e a regra dos centavos", () => {
    expect(JSON_IMPORT_PROMPT).toMatch(/CENTAVOS/);
    expect(JSON_IMPORT_PROMPT).toContain('"version": 1');
  });
});

describe("registro de leitores", () => {
  it("formato pelo nome do arquivo", () => {
    expect(detectFormatFromName("Fatura.PDF")).toBe("pdf");
    expect(detectFormatFromName("extrato.ofx")).toBe("ofx");
    expect(detectFormatFromName("x.json")).toBe("json");
    expect(detectFormatFromName("x.xlsx")).toBeNull();
  });
  it("PDF de outro banco → mensagem com o caminho alternativo", () => {
    expect(() => parseImport({ format: "pdf", items: [{ p: 1, x: 0, y: 0, w: 1, s: "Banco Qualquer" }] })).toThrow(/OFX.*JSON/);
  });
  it("despacha OFX e JSON", () => {
    expect(parseImport({ format: "ofx", text: OFX_BANK }).format).toBe("ofx");
    expect(parseImport({ format: "json", text: goodJson() }).format).toBe("json");
  });
  it("reconcileGeneric é exato em centavos", () => {
    const tx = (amountCents: number, kind: "avista" | "pagamento" = "avista") => ({ amountCents, amountUsdCents: null, kind, section: "despesas" as const, installmentN: null, installmentTotal: null });
    expect(reconcileGeneric(100, [tx(60), tx(40), tx(-999, "pagamento")]).status).toBe("ok");
    expect(reconcileGeneric(100, [tx(60), tx(41)]).totalDiffCents).toBe(1);
  });
});
