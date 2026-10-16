import { describe, expect, it } from "vitest";
import { CAT } from "../src/categories.ts";
import { withSearchText, categoriesIn, groupByMonth, normalizeSearchText, searchPeriodRange, searchTransactions, searchTypeOf, summarize, type SearchTx } from "../src/search.ts";

const ME = "u-me";
const PAR = "u-par";
const ctx = { today: "2026-10-16", meUserId: ME, partnerUserId: PAR };

let n = 0;
const tx = (p: Partial<SearchTx> & { id?: string }): SearchTx & { id: string } => ({
  id: p.id ?? `t${++n}`,
  statementMonth: p.statementMonth ?? (p.postedOn ?? "2026-10-05").slice(0, 7),
  postedOn: p.postedOn ?? "2026-10-05",
  descriptionRaw: p.descriptionRaw ?? "LOJA X",
  amountCents: p.amountCents ?? 1000,
  categoryId: p.categoryId ?? CAT.COMPRAS,
  kind: p.kind ?? "avista",
  ownerUserId: p.ownerUserId ?? null,
  ...p,
});

const data = [
  tx({ id: "ifood1", descriptionRaw: "IFD*IFOOD CLUB", merchantName: "iFood", postedOn: "2026-10-10", amountCents: 5000, categoryId: CAT.RESTAURANTE, ownerUserId: ME }),
  tx({ id: "pao", descriptionRaw: "PADARIA SÃO JOSÉ", postedOn: "2026-10-02", amountCents: 1200, categoryId: CAT.RESTAURANTE }),
  tx({ id: "merc", descriptionRaw: "SUPERMERCADO BOM PRECO", postedOn: "2026-09-20", amountCents: 30000, categoryId: CAT.MERCADO, ownerUserId: PAR }),
  tx({ id: "parc", descriptionRaw: "MAGAZINE 03/10", kind: "parcela", statementMonth: "2026-11", postedOn: "2026-02-01", amountCents: 9900 }),
  tx({ id: "pix", descriptionRaw: "PIX DIARISTA", descriptionClean: "Pix · Diarista", manual: true, postedOn: "2026-10-12", amountCents: 15000, categoryId: CAT.CASA }),
  tx({ id: "est", descriptionRaw: "ESTORNO LOJA", kind: "estorno", postedOn: "2026-10-03", amountCents: -2000 }),
  tx({ id: "pag", descriptionRaw: "PAGAMENTO FATURA", kind: "pagamento", postedOn: "2026-10-01", amountCents: -100000 }),
  tx({ id: "velho", descriptionRaw: "IFD*IFOOD", merchantName: "iFood", postedOn: "2025-12-10", amountCents: 4000, categoryId: CAT.RESTAURANTE }),
  tx({ id: "hidden", descriptionRaw: "GASTO PESSOAL PAR", hiddenAggregate: true, statementMonth: "2026-10", postedOn: "2026-10-01", amountCents: 7000, categoryId: CAT.RESTAURANTE, ownerUserId: PAR }),
];

const ids = (r: { rows: { id: string }[] }) => r.rows.map((t) => t.id);

describe("busca: normalização e tipo", () => {
  it("tira acentos, caixa e pontuação", () => {
    expect(normalizeSearchText("  Padaria  São-José! ")).toBe("padaria sao jose");
  });
  it("classifica o tipo do lançamento", () => {
    expect(searchTypeOf({ kind: "avista" })).toBe("avista");
    expect(searchTypeOf({ kind: "avista", manual: true })).toBe("manual");
    expect(searchTypeOf({ kind: "parcela" })).toBe("parcela");
    expect(searchTypeOf({ kind: "pagamento" })).toBeNull();
  });
  it("períodos relativos a hoje", () => {
    expect(searchPeriodRange("month", "2026-10-16").from).toBe("2026-10-01");
    expect(searchPeriodRange("3m", "2026-01-16").from).toBe("2025-11-01");
    expect(searchPeriodRange("year", "2026-10-16").from).toBe("2026-01-01");
    expect(searchPeriodRange("all", "2026-10-16").from).toBeNull();
  });
});

describe("searchTransactions", () => {
  it("sem filtros: tudo menos pagamento e gasto pessoal do par, do mais recente", () => {
    const r = searchTransactions(data, {}, ctx);
    expect(ids(r)).toEqual(["parc", "pix", "ifood1", "est", "pao", "merc", "velho"]);
    expect(r.count).toBe(7);
    expect(r.totalCents).toBe(5000 + 1200 + 30000 + 9900 + 15000 - 2000 + 4000);
    expect(r.averageCents).toBe(Math.round(r.totalCents / 7));
    expect(r.hiddenCents).toBe(7000);
  });

  it("texto sem acento casa com estabelecimento e descrição; todos os termos precisam bater", () => {
    expect(ids(searchTransactions(data, { text: "sao jose" }, ctx))).toEqual(["pao"]);
    expect(ids(searchTransactions(data, { text: "ifood" }, ctx))).toEqual(["ifood1", "velho"]);
    expect(ids(searchTransactions(data, { text: "Diarista" }, ctx))).toEqual(["pix"]);
    expect(ids(searchTransactions(data, { text: "ifood padaria" }, ctx))).toEqual([]);
    expect(ids(searchTransactions(withSearchText(data), { text: "SÃO josé" }, ctx))).toEqual(["pao"]);
  });

  it("texto ou tipo escondem a nota do gasto pessoal (não dá para saber o que casaria)", () => {
    expect(searchTransactions(data, { text: "ifood" }, ctx).hiddenCents).toBeNull();
    expect(searchTransactions(data, { type: "avista" }, ctx).hiddenCents).toBeNull();
  });

  it("período: parcela conta no mês da cobrança", () => {
    const r = searchTransactions(data, { period: "month" }, ctx);
    expect(ids(r)).toEqual(["parc", "pix", "ifood1", "est", "pao"]);
    expect(ids(searchTransactions(data, { period: "year" }, ctx))).not.toContain("velho");
    expect(ids(searchTransactions(data, { period: "3m" }, ctx))).toContain("merc");
  });

  it("categoria e de quem", () => {
    const rest = searchTransactions(data, { categoryId: CAT.RESTAURANTE }, ctx);
    expect(ids(rest)).toEqual(["ifood1", "pao", "velho"]);
    expect(rest.hiddenCents).toBe(7000);
    expect(ids(searchTransactions(data, { owner: "me" }, ctx))).toEqual(["ifood1"]);
    const par = searchTransactions(data, { owner: "partner" }, ctx);
    expect(ids(par)).toEqual(["merc"]);
    expect(par.hiddenCents).toBe(7000);
    expect(searchTransactions(data, { owner: "shared" }, ctx).hiddenCents).toBe(0);
    expect(ids(searchTransactions(data, { owner: "partner" }, { ...ctx, partnerUserId: null }))).toEqual([]);
  });

  it("tipo", () => {
    expect(ids(searchTransactions(data, { type: "manual" }, ctx))).toEqual(["pix"]);
    expect(ids(searchTransactions(data, { type: "parcela" }, ctx))).toEqual(["parc"]);
    expect(ids(searchTransactions(data, { type: "estorno" }, ctx))).toEqual(["est"]);
    expect(ids(searchTransactions(data, { type: "avista" }, ctx))).toEqual(["ifood1", "pao", "merc", "velho"]);
  });
});

describe("agrupamento e totais", () => {
  it("groupByMonth intercala cabeçalhos com o total do mês", () => {
    const { rows } = searchTransactions(data, {}, ctx);
    const items = groupByMonth(rows, (t) => t.id);
    const headers = items.filter((i) => i.type === "month");
    expect(headers.map((h) => h.month)).toEqual(["2026-10", "2026-09", "2025-12"]);
    expect(headers[0]).toMatchObject({ totalCents: 15000 + 5000 + 9900 - 2000 + 1200, count: 5 });
    expect(items[1]).toMatchObject({ type: "tx", key: "parc", index: 0 });
    expect(items).toHaveLength(rows.length + 3);
  });

  it("summarize (seleção múltipla) e lista vazia", () => {
    expect(summarize([{ amountCents: 100 }, { amountCents: 201 }])).toEqual({ totalCents: 301, count: 2, averageCents: 151 });
    expect(summarize([])).toEqual({ totalCents: 0, count: 0, averageCents: 0 });
  });

  it("categoriesIn ordena pelo que mais soma, sem pagamento nem gasto pessoal", () => {
    expect(categoriesIn(data)).toEqual([CAT.MERCADO, CAT.CASA, CAT.RESTAURANTE, CAT.COMPRAS]);
  });
});
