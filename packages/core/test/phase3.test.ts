import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { usdServices, purchaseWindow } from "../src/cardmonitor.ts";
import { projectCashflow, variableOfMonth } from "../src/cashflow.ts";
import { CAT } from "../src/categories.ts";
import { buildDraft } from "../src/draft.ts";
import { goalFeasibility, goalProgress } from "../src/goals.ts";
import { detectHabits } from "../src/habits.ts";
import { futureInstallmentTimeline } from "../src/installments.ts";
import { merchantKey } from "../src/normalize.ts";
import { parseSantanderStatement } from "../src/parsers/santander/index.ts";
import { effectiveDate, parsePeriod, runQuery, type QueryTx } from "../src/query.ts";
import { detectRecurring } from "../src/recurring.ts";
import { EDUCATION_LIMIT_CENTS_DEFAULT, suggestTaxKind, taxCandidates, taxCsv, taxReport, type TaxTx } from "../src/tax.ts";

const dir = path.resolve(import.meta.dirname, "../../../fixtures/santander");
const months = fs.readdirSync(dir).filter((f) => f.endsWith(".items.json")).map((f) => f.slice(0, 7)).sort();
const parsed = new Map(months.map((m) => [m, parseSantanderStatement(JSON.parse(fs.readFileSync(path.join(dir, `${m}.items.json`), "utf8")))]));
const all = months.flatMap((m) => buildDraft(parsed.get(m)!, { accountId: "a" }).transactions.map((t) => ({ ...t, statementMonth: m })));
const ctx = { today: "2026-10-12", meUserId: "me", partnerUserId: "bia", partnerName: "Bia" };

describe("custo do hábito", () => {
  const habits = detectHabits(all, "2026-10");
  it("acha os estabelecimentos de visita quase diária, com custo anual", () => {
    expect(habits.length).toBeGreaterThanOrEqual(2);
    for (const h of habits) {
      expect(h.visitsPerMonth).toBeGreaterThanOrEqual(6);
      expect(h.annualCostCents).toBe(h.monthlyCostCents * 12);
      expect(h.saveIfCutQuarterCents).toBe(Math.round(h.monthlyCostCents * 0.25));
    }
    expect([...habits].sort((a, b) => b.annualCostCents - a.annualCostCents)).toEqual(habits);
    expect(habits.some((h) => h.cadence === "quase todo dia")).toBe(true);
  });
  it("confere com contagem direta nos lançamentos", () => {
    const top = habits[0]!;
    const window = ["2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05"];
    const mine = all.filter((t) => window.includes(t.statementMonth) && t.kind === "avista" && merchantKey(t.descriptionRaw) === top.key);
    expect(top.visits).toBe(mine.length);
    expect(top.monthlyCostCents).toBe(Math.round(mine.reduce((a, t) => a + t.amountCents, 0) / 6));
  });
  it("assinatura (1–2 cobranças/mês) não é hábito", () => {
    expect(habits.some((h) => /ANTHROPIC/.test(h.key))).toBe(false);
  });
});

describe("imposto de renda", () => {
  it("sugere saúde/educação, mas não farmácia, academia nem livros", () => {
    expect(suggestTaxKind(CAT.SAUDE, "CLINICA ODONTO SORRISO").kind).toBe("saude");
    expect(suggestTaxKind(CAT.SAUDE, "UNIMED PLANO").kind).toBe("saude");
    expect(suggestTaxKind(CAT.SAUDE, "DROGARIA CATARINENSE")).toMatchObject({ kind: null });
    expect(suggestTaxKind(CAT.SAUDE, "DROGARIA CATARINENSE").note).toMatch(/Medicamento/);
    expect(suggestTaxKind(CAT.SAUDE, "SMART FIT").kind).toBeNull();
    expect(suggestTaxKind(CAT.EDUCACAO, "COLEGIO SAO JOSE").kind).toBe("educacao");
    expect(suggestTaxKind(CAT.EDUCACAO, "LIVRARIA CULTURA").kind).toBeNull();
    expect(suggestTaxKind(CAT.LAZER, "CINEMA").kind).toBeNull();
  });

  const tx = (o: Partial<TaxTx> & { id: string; amountCents: number }): TaxTx => ({ postedOn: "2026-03-10", descriptionClean: "X", descriptionRaw: "X", categoryId: CAT.SAUDE, taxDeductible: true, ownerUserId: "me", ...o });
  const txs: TaxTx[] = [
    tx({ id: "1", amountCents: 35000, descriptionClean: "Clínica Sorriso", descriptionRaw: "CLINICA SORRISO", attachmentPath: "h/1.jpg" }),
    tx({ id: "2", amountCents: 12000, descriptionClean: "Laboratório", descriptionRaw: "LABORATORIO CENTRAL" }),
    tx({ id: "3", amountCents: 300000, categoryId: CAT.EDUCACAO, descriptionClean: "Faculdade", descriptionRaw: "FACULDADE X", attachmentPath: "h/3.jpg" }),
    tx({ id: "4", amountCents: 200000, categoryId: CAT.EDUCACAO, descriptionClean: "Curso", descriptionRaw: "CURSO Y", attachmentPath: "h/4.jpg", ownerUserId: "bia" }),
    tx({ id: "5", amountCents: 9900, taxDeductible: false, descriptionRaw: "CLINICA DERMA", descriptionClean: "Clínica Derma" }),
    tx({ id: "6", amountCents: 5000, postedOn: "2025-12-01" }),
  ];

  it("relatório anual: educação respeita o limite, e conta comprovantes faltando", () => {
    const r = taxReport(txs, 2026);
    expect(r.year).toBe(2026);
    const saude = r.sections.find((s) => s.kind === "saude")!;
    const edu = r.sections.find((s) => s.kind === "educacao")!;
    expect(saude.totalCents).toBe(47000);
    expect(saude.missingReceipts).toBe(1);
    expect(edu.totalCents).toBe(500000);
    expect(edu.deductibleCents).toBe(EDUCATION_LIMIT_CENTS_DEFAULT);
    expect(r.totalDeductibleCents).toBe(47000 + EDUCATION_LIMIT_CENTS_DEFAULT);
    expect(r.missingReceipts).toBe(1);
  });
  it("por pessoa (cada um declara o seu)", () => {
    const bia = taxReport(txs, 2026, { ownerUserId: "bia" });
    expect(bia.totalCents).toBe(200000);
    expect(bia.totalDeductibleCents).toBe(200000);
  });
  it("candidatos = sugeridos ainda não marcados", () => {
    expect(taxCandidates(txs, 2026).map((t) => t.id)).toEqual(["5"]);
  });
  it("CSV em pt-BR (; e vírgula decimal), com FALTA e totais", () => {
    const csv = taxCsv(taxReport(txs, 2026), (id) => (id === "me" ? "Ana" : id === "bia" ? "Bia" : "Nosso"));
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Ano;Tipo;Data;Descrição;Pessoa;Valor (R$);Comprovante");
    expect(lines).toContain("2026;Saúde;10/03/2026;Clínica Sorriso;Ana;350,00;sim");
    expect(lines).toContain("2026;Saúde;10/03/2026;Laboratório;Ana;120,00;FALTA");
    expect(csv).toContain(";TOTAL DEDUTÍVEL;;;;");
    expect(csv).toContain("Educação — dedutível até o limite");
    // saúde R$ 470,00 + educação limitada a R$ 3.561,50
    expect(lines.at(-1)).toBe(";TOTAL DEDUTÍVEL;;;;4.031,50;");
  });
});

describe("metas", () => {
  it("quanto falta por mês", () => {
    const p = goalProgress({ targetCents: 1200000, savedCents: 300000, dueDate: "2027-04-15" }, "2026-10-12");
    expect(p).toMatchObject({ percent: 25, remainingCents: 900000, monthsLeft: 6, monthlyNeededCents: 150000, status: "no_prazo" });
  });
  it("arredonda para cima, no mínimo 1 mês", () => {
    expect(goalProgress({ targetCents: 10000, savedCents: 0, dueDate: "2026-10-30" }, "2026-10-12")).toMatchObject({ monthsLeft: 1, monthlyNeededCents: 10000 });
    expect(goalProgress({ targetCents: 10000, savedCents: 0, dueDate: "2026-12-30" }, "2026-10-12").monthlyNeededCents).toBe(5000);
    expect(goalProgress({ targetCents: 10001, savedCents: 0, dueDate: "2026-12-30" }, "2026-10-12").monthlyNeededCents).toBe(5001);
  });
  it("concluída, atrasada e sem prazo", () => {
    expect(goalProgress({ targetCents: 100, savedCents: 150, dueDate: null }, "2026-10-12")).toMatchObject({ status: "concluida", remainingCents: 0, percent: 150 });
    expect(goalProgress({ targetCents: 1000, savedCents: 200, dueDate: "2026-09-01" }, "2026-10-12")).toMatchObject({ status: "atrasada", monthlyNeededCents: 800 });
    expect(goalProgress({ targetCents: 1000, savedCents: 200, dueDate: null }, "2026-10-12")).toMatchObject({ status: "sem_prazo", monthlyNeededCents: null });
  });
  it("cabe no que sobra?", () => {
    expect(goalFeasibility(100, 1000)).toBe("cabe");
    expect(goalFeasibility(900, 1000)).toBe("apertado");
    expect(goalFeasibility(1100, 1000)).toBe("nao_cabe");
    expect(goalFeasibility(null, 1000)).toBe("desconhecido");
  });
});

describe("fluxo de caixa", () => {
  const recurring = detectRecurring(all, "2026-10");
  const timeline = futureInstallmentTimeline(all.filter((t) => t.statementMonth === "2026-10" && t.kind === "parcela"), "2026-10");
  const cf = projectCashflow({ latestMonth: "2026-10", txs: all, recurring, futureInstallments: timeline.months, incomeCents: 1500000, otherFixedCents: 400000 });

  it("6 meses seguintes; renda − fixos − parcelas − variável = saldo", () => {
    expect(cf.months.map((m) => m.monthKey)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
    let cum = 0;
    for (const m of cf.months) {
      expect(m.outCents).toBe(m.fixedCents + m.installmentsCents + m.variableCents);
      expect(m.netCents).toBe(1500000 - m.outCents);
      cum += m.netCents;
      expect(m.cumulativeNetCents).toBe(cum);
    }
    expect(cf.avgNetCents).toBe(Math.round(cum / 6));
  });
  it("parcelas do 1º mês = piso da próxima fatura; depois só caem", () => {
    expect(cf.months[0]!.installmentsCents).toBe(timeline.months[0]!.totalCents);
    const inst = cf.months.map((m) => m.installmentsCents);
    expect([...inst].sort((a, b) => b - a)).toEqual(inst);
  });
  it("variável = média dos 3 últimos meses sem parcelas, encargos nem recorrências", () => {
    const keys = new Set(recurring.items.filter((i) => i.active).map((i) => i.key));
    const expected = Math.round((variableOfMonth(all, "2026-10", keys) + variableOfMonth(all, "2026-09", keys) + variableOfMonth(all, "2026-08", keys)) / 3);
    expect(cf.variableAvgCents).toBe(expected);
    expect(cf.fixedCents).toBe(recurring.monthlyTotalCents + 400000);
    // variável nunca é maior que o total do mês
    const total10 = all.filter((t) => t.statementMonth === "2026-10" && t.kind !== "pagamento").reduce((a, t) => a + t.amountCents, 0);
    expect(variableOfMonth(all, "2026-10", keys)).toBeLessThan(total10);
  });
  it("sem renda informada o saldo fica negativo (a conta é honesta)", () => {
    const zero = projectCashflow({ latestMonth: "2026-10", txs: all, recurring, futureInstallments: timeline.months, incomeCents: 0, otherFixedCents: 0 });
    expect(zero.months.every((m) => m.netCents < 0)).toBe(true);
  });
});

describe("perguntas em linguagem natural (sem IA)", () => {
  const qtx: QueryTx[] = all.map((t, i) => ({ ...t, ownerUserId: i % 3 === 0 ? "me" : i % 3 === 1 ? "bia" : null }));

  it("períodos", () => {
    const p = (s: string) => parsePeriod(s, "2026-10-12");
    expect(p("desde julho")).toMatchObject({ from: "2026-07-01", to: "2026-10-12" });
    expect(p("desde novembro")).toMatchObject({ from: "2025-11-01" }); // novembro ainda não chegou em 2026
    expect(p("em agosto")).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
    expect(p("em marco de 2025")).toMatchObject({ from: "2025-03-01", to: "2025-03-31" });
    expect(p("de junho a agosto")).toMatchObject({ from: "2026-06-01", to: "2026-08-31" });
    expect(p("este mes")).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(p("mes passado")).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(p("ultimos 3 meses")).toMatchObject({ from: "2026-08-01", to: "2026-10-12" });
    expect(p("ano passado")).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
    expect(p("este ano")).toMatchObject({ from: "2026-01-01" });
    expect(p("quanto gastamos")).toBeNull();
  });

  it("“quanto gastamos com restaurante desde julho?” bate com a soma direta", () => {
    const r = runQuery("quanto gastamos com restaurante desde julho?", qtx, ctx);
    const direct = qtx.filter((t) => t.kind !== "pagamento" && t.categoryId === CAT.RESTAURANTE && effectiveDate(t) >= "2026-07-01" && effectiveDate(t) <= "2026-10-12");
    expect(r.ok).toBe(true);
    expect(r.totalCents).toBe(direct.reduce((a, t) => a + t.amountCents, 0));
    expect(r.count).toBe(direct.length);
    expect(r.answer).toMatch(/^Vocês gastaram R\$ [\d.]+,\d{2} com Alimentação \(restaurante\/delivery\) desde julho de 2026/);
    expect(r.byMonth.reduce((a, m) => a + m.cents, 0)).toBe(r.totalCents);
  });

  it("termos específicos filtram pelo nome (IOF, Anthropic)", () => {
    const iof = runQuery("quanto paguei de IOF este ano", qtx, ctx);
    const direct = qtx.filter((t) => /\bIOF\b/.test(t.descriptionRaw) && t.postedOn >= "2026-01-01");
    expect(iof.totalCents).toBe(direct.reduce((a, t) => a + t.amountCents, 0));
    expect(iof.parsed.categoryIds).toEqual([]);
    const anth = runQuery("quanto gastamos com anthropic", qtx, ctx);
    expect(anth.totalCents).toBe(qtx.filter((t) => /ANTHROPIC/.test(t.descriptionRaw)).reduce((a, t) => a + t.amountCents, 0));
  });

  it("de quem: meu, dela(e) e compartilhado", () => {
    const base = runQuery("quanto gastamos com mercado", qtx, ctx).totalCents;
    const me = runQuery("quanto eu gastei com mercado", qtx, ctx).totalCents;
    const bia = runQuery("quanto a Bia gastou com mercado", qtx, ctx).totalCents;
    const shared = runQuery("quanto gastamos com mercado em gastos compartilhados", qtx, ctx).totalCents;
    expect(me + bia + shared).toBe(base);
    expect(me).toBeGreaterThan(0);
  });

  it("contagem, média, ranking", () => {
    expect(runQuery("quantas vezes fomos em restaurante em agosto", qtx, ctx).answer).toMatch(/^\d+ lançamentos de Alimentação \(restaurante\/delivery\) em agosto de 2026, somando R\$/);
    expect(runQuery("qual a média de gastos com mercado nos últimos 3 meses", qtx, ctx).answer).toMatch(/^Média de R\$ [\d.]+,\d{2} por mês/);
    const top = runQuery("onde mais gastamos no mês passado", qtx, ctx);
    expect(top.parsed.intent).toBe("top");
    expect(top.topMerchants[0]!.cents).toBeGreaterThanOrEqual(top.topMerchants[1]!.cents);
  });

  it("só usa dados do casal: gasto pessoal oculto fica de fora e é avisado", () => {
    const hidden: QueryTx = { statementMonth: "2026-09", postedOn: "2026-09-01", descriptionRaw: "GASTO PESSOAL BIA", amountCents: 999900, categoryId: CAT.LAZER, kind: "avista", ownerUserId: "bia", hiddenAggregate: true };
    const r = runQuery("quanto gastamos com lazer em setembro", [...qtx, hidden], ctx);
    expect(r.totalCents).toBe(runQuery("quanto gastamos com lazer em setembro", qtx, ctx).totalCents);
    expect(r.notes.join(" ")).toMatch(/pessoais do seu par/);
  });

  it("não inventa: pergunta sem sentido e termo desconhecido", () => {
    const bad = runQuery("blablabla", qtx, ctx);
    expect(bad.ok).toBe(false);
    expect(bad.answer).toMatch(/Não entendi/);
    const unknown = runQuery("quanto gastamos com xyzzyfoo", qtx, ctx);
    expect(unknown.parsed.unknownTerms).toContain("xyzzyfoo");
    expect(unknown.notes.join(" ")).toMatch(/xyzzyfoo/);
  });
});

describe("monitor de cartão", () => {
  it("melhor dia de compra e prazo até pagar (set/26 e out/26)", () => {
    const s = parsed.get("2026-10")!;
    expect(purchaseWindow({ dueDate: s.dueDate, closingDate: s.closingDate, bestPurchaseDate: s.bestPurchaseDate })).toEqual({
      bestDay: "2026-10-30", bestDayDueDate: "2026-12-06", daysToPayBest: 37,
      worstDay: "2026-10-29", worstDayDueDate: "2026-11-06", daysToPayWorst: 8,
    });
  });
  it("sem 'melhor dia' no PDF, usa o dia seguinte ao fechamento", () => {
    expect(purchaseWindow({ dueDate: "2026-10-06", closingDate: "2026-09-29", bestPurchaseDate: null }).bestDay).toBe("2026-09-30");
  });
  it("dólar: câmbio, IOF de 3,5% e custo anual com IOF", () => {
    const services = usdServices(all);
    expect(services.length).toBeGreaterThanOrEqual(1);
    const claude = services.find((s) => s.charges >= 3)!;
    expect(claude.iofPercent).toBeCloseTo(3.5, 1);
    expect(claude.lastFx).toBeGreaterThan(5);
    expect(claude.annualCostCents).toBe(claude.monthlyCostCents * 12);
    // todo IOF ligado a uma compra em dólar é contabilizado exatamente uma vez
    const allIof = all.filter((t) => t.kind === "encargo" && /^IOF/.test(t.descriptionRaw)).reduce((a, t) => a + t.amountCents, 0);
    expect(services.reduce((a, s) => a + s.iofCents, 0)).toBe(allIof);
  });
});
