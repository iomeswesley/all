import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hiddenTotalsToTx, topMerchants, totalSpent, type AnalyticsTx } from "../src/analytics.ts";
import { alertKey, budgetStatuses, effectiveBudgets, levelOf, pendingAlerts } from "../src/budget.ts";
import { avoidableCharges, classifyCharge } from "../src/charges.ts";
import { buildCheckin, type CheckinTx } from "../src/checkin.ts";
import { CAT } from "../src/categories.ts";
import { buildDraft } from "../src/draft.ts";
import { parseSantanderStatement } from "../src/parsers/santander/index.ts";
import { reconcile } from "../src/reconcile.ts";
import { detectRecurring } from "../src/recurring.ts";

const dir = path.resolve(import.meta.dirname, "../../../fixtures/santander");
const months = fs.readdirSync(dir).filter((f) => f.endsWith(".items.json")).map((f) => f.slice(0, 7)).sort();
const drafts = new Map(months.map((m) => [m, buildDraft(parseSantanderStatement(JSON.parse(fs.readFileSync(path.join(dir, `${m}.items.json`), "utf8"))), { accountId: "a" })]));
const allTx: CheckinTx[] = months.flatMap((m) => drafts.get(m)!.transactions.map((t) => ({ ...t, statementMonth: m, postedOn: t.postedOn, descriptionRaw: t.descriptionRaw, ownerUserId: t.ownerUserId, amountCents: t.amountCents, categoryId: t.categoryId, kind: t.kind, merchantName: t.merchantName, amountUsdCents: t.amountUsdCents })));

describe("orçamento", () => {
  it("limiar de 80% e 100% em inteiros (sem float)", () => {
    expect(levelOf(7999, 10000)).toBe("ok");
    expect(levelOf(8000, 10000)).toBe("warn80");
    expect(levelOf(9999, 10000)).toBe("warn80");
    expect(levelOf(10000, 10000)).toBe("over100");
    expect(levelOf(5, 0)).toBe("ok");
    expect(levelOf(81, 101)).toBe("warn80"); // 80,19%
    expect(levelOf(80, 101)).toBe("ok"); // 79,2%
  });

  it("o limite vale para os meses seguintes até alguém mudar", () => {
    const rows = [
      { categoryId: 1, month: "2026-05", limitCents: 100000 },
      { categoryId: 1, month: "2026-08", limitCents: 120000 },
      { categoryId: 2, month: "2026-09", limitCents: 50000 },
      { categoryId: 3, month: "2026-06", limitCents: 0 },
    ];
    expect(effectiveBudgets(rows, "2026-07").get(1)).toBe(100000);
    expect(effectiveBudgets(rows, "2026-10").get(1)).toBe(120000);
    expect(effectiveBudgets(rows, "2026-08").has(2)).toBe(false);
    expect(effectiveBudgets(rows, "2026-10").has(3)).toBe(false); // 0 = sem orçamento
  });

  const tx = (categoryId: number, amountCents: number): AnalyticsTx => ({ statementMonth: "2026-09", postedOn: "2026-08-10", descriptionRaw: "X", amountCents, categoryId, kind: "avista", ownerUserId: null });

  it("status por categoria, estorno abate e pagamento não conta", () => {
    const s = budgetStatuses(new Map([[CAT.MERCADO, 100000], [CAT.LAZER, 20000]]), [
      tx(CAT.MERCADO, 85000), tx(CAT.MERCADO, -5000), tx(CAT.LAZER, 25000),
      { ...tx(CAT.MERCADO, -999999), kind: "pagamento" },
    ]);
    expect(s.map((x) => [x.categoryId, x.spentCents, x.percent, x.level])).toEqual([[CAT.LAZER, 25000, 125, "over100"], [CAT.MERCADO, 80000, 80, "warn80"]]);
    expect(s[0]!.remainingCents).toBe(-5000);
  });

  it("alertas saem uma vez por nível; 100% dispensa o aviso de 80%", () => {
    const st = budgetStatuses(new Map([[1, 1000], [2, 1000], [3, 1000]]), [tx(1, 850), tx(2, 1200), tx(3, 100)]);
    const first = pendingAlerts(st, "2026-09", new Set());
    expect(first.map((a) => `${a.categoryId}:${a.level}`).sort()).toEqual(["1:warn80", "2:over100"]);
    const sent = new Set(first.map((a) => alertKey(a.categoryId, a.month, a.level)));
    expect(pendingAlerts(st, "2026-09", sent)).toEqual([]);
    // cruzou 100% depois de já ter avisado 80%
    const worse = budgetStatuses(new Map([[1, 1000]]), [tx(1, 1100)]);
    expect(pendingAlerts(worse, "2026-09", sent).map((a) => a.level)).toEqual(["over100"]);
    // 80% não repete se 100% já foi enviado
    const back = budgetStatuses(new Map([[1, 1000]]), [tx(1, 900)]);
    expect(pendingAlerts(back, "2026-09", new Set([alertKey(1, "2026-09", "over100")]))).toEqual([]);
  });
});

describe("encargos evitáveis", () => {
  it("classifica", () => {
    expect(classifyCharge("IOF DESPESA NO EXTERIOR")).toBe("iof");
    expect(classifyCharge("ANUIDADE DIFERENCIADA")).toBe("anuidade");
    expect(classifyCharge("JUROS DE MORA")).toBe("juros");
    expect(classifyCharge("MULTA POR ATRASO")).toBe("multa");
    expect(classifyCharge("SEGURO PRESTAMISTA")).toBe("seguro");
    expect(classifyCharge("LOJA")).toBeNull();
  });

  it("ago/26: três IOFs somam R$ 9,11 e a anuidade está 100% isenta", () => {
    const d = drafts.get("2026-08")!;
    const c = avoidableCharges(d.transactions, { installmentCents: d.statement.annuityCents, paidCents: d.statement.annuityPaidCents, discountPercent: d.statement.annuityDiscountPercent });
    expect(c.iofCents).toBe(408 + 95 + 408);
    expect(c.lateCents).toBe(0);
    expect(c.annuity).toEqual({ fullCents: 8750, paidCents: 0, discountPercent: 100, waived: true, savedPerMonthCents: 8750 });
  });

  it("juros e multa de uma fatura em atraso", () => {
    const c = avoidableCharges([
      { descriptionRaw: "JUROS ROTATIVO", amountCents: 12000, kind: "encargo" },
      { descriptionRaw: "MULTA", amountCents: 2000, kind: "encargo" },
      { descriptionRaw: "IOF ROTATIVO", amountCents: 300, kind: "encargo" },
      { descriptionRaw: "ANUIDADE", amountCents: 8750, kind: "encargo" },
      { descriptionRaw: "MERCADO", amountCents: 100, kind: "avista" },
    ], { installmentCents: 8750, paidCents: 8750, discountPercent: 0 });
    expect(c.lateCents).toBe(14000);
    expect(c.totalCents).toBe(12000 + 2000 + 300 + 8750);
    expect(c.annuity?.waived).toBe(false);
  });
});

describe("check-in mensal", () => {
  const ci = buildCheckin({ month: "2026-10", txs: allTx, budgets: new Map([[CAT.RESTAURANTE, 100000], [CAT.COMPRAS, 20000]]), annuity: { installmentCents: 8750, paidCents: 0, discountPercent: 100 } });

  it("total e variação batem com as faturas", () => {
    expect(ci.totalCents).toBe(drafts.get("2026-10")!.statement.declaredExpensesCents);
    expect(ci.prevTotalCents).toBe(drafts.get("2026-09")!.statement.declaredExpensesCents);
    expect(ci.deltaCents).toBe(ci.totalCents - ci.prevTotalCents!);
  });

  it("traz de 1 a 5 recomendações, ordenadas por economia, todas com valor positivo em centavos inteiros", () => {
    expect(ci.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(ci.recommendations.length).toBeLessThanOrEqual(5);
    const s = ci.recommendations.map((r) => r.savingsCentsPerMonth);
    expect([...s].sort((a, b) => b - a)).toEqual(s);
    for (const r of ci.recommendations) { expect(r.savingsCentsPerMonth).toBeGreaterThan(0); expect(Number.isInteger(r.savingsCentsPerMonth)).toBe(true); expect(r.title.length).toBeGreaterThan(5); }
    expect(ci.estimatedSavingsCents).toBe(s.reduce((a, b) => a + b, 0));
  });

  it("orçamento estourado vira recomendação com o valor do estouro", () => {
    const over = ci.budgets.find((b) => b.level === "over100");
    if (over) expect(ci.recommendations.find((r) => r.id === `orc:${over.categoryId}`)?.savingsCentsPerMonth).toBe(over.spentCents - over.limitCents);
    const tight = buildCheckin({ month: "2026-10", txs: allTx, budgets: new Map([[CAT.RESTAURANTE, 1000]]) });
    expect(tight.budgets[0]!.level).toBe("over100");
    expect(tight.recommendations.some((r) => r.kind === "orcamento")).toBe(true);
  });

  it("assinatura duplicada e juros viram recomendações", () => {
    const mk = (m: string, day: string, amt: number): CheckinTx => ({ statementMonth: m, postedOn: `${m}-${day}`, descriptionRaw: "SPOTIFY", amountCents: amt, categoryId: CAT.ASSINATURAS, kind: "avista", ownerUserId: null });
    const juros: CheckinTx = { statementMonth: "2026-09", postedOn: "2026-09-01", descriptionRaw: "JUROS DE MORA", amountCents: 3300, categoryId: CAT.SERVICOS, kind: "encargo", ownerUserId: null };
    const c = buildCheckin({ month: "2026-09", txs: [mk("2026-08", "05", 2190), mk("2026-09", "05", 2190), mk("2026-09", "07", 2190), juros] });
    expect(c.recommendations.find((r) => r.kind === "duplicada")?.savingsCentsPerMonth).toBe(2190);
    expect(c.recommendations.find((r) => r.kind === "juros")?.savingsCentsPerMonth).toBe(3300);
  });

  it("categoria acima da média dos meses anteriores (e anuidade cobrada)", () => {
    const mk = (m: string, amt: number): CheckinTx => ({ statementMonth: m, postedOn: `${m}-10`, descriptionRaw: "LOJA", amountCents: amt, categoryId: CAT.LAZER, kind: "avista", ownerUserId: null });
    const c = buildCheckin({ month: "2026-09", txs: [mk("2026-06", 10000), mk("2026-07", 12000), mk("2026-08", 14000), mk("2026-09", 30000)], annuity: { installmentCents: 8750, paidCents: 8750, discountPercent: 0 } });
    expect(c.recommendations.find((r) => r.kind === "categoria_acima")?.savingsCentsPerMonth).toBe(30000 - 12000);
    expect(c.recommendations.find((r) => r.kind === "anuidade")?.savingsCentsPerMonth).toBe(8750);
  });

  it("texto para compartilhar em pt-BR", () => {
    expect(ci.text).toContain("Check-in — fatura de outubro de 2026");
    expect(ci.text).toMatch(/Total: R\$ [\d.]+,\d{2}/);
    expect(ci.text).toContain("Recomendações:");
  });

  it("sem mês anterior não inventa comparação", () => {
    const first = buildCheckin({ month: "2026-04", txs: allTx });
    expect(first.deltaCents).toBeNull();
    expect(first.risers).toEqual([]);
    expect(first.text).not.toContain("Vs ");
  });
});

describe("gasto pessoal do parceiro (agregado oculto)", () => {
  it("entra nos totais, mas não vira estabelecimento nem recorrência", () => {
    const base: CheckinTx[] = ["2026-08", "2026-09"].map((m) => ({ statementMonth: m, postedOn: `${m}-10`, descriptionRaw: "MERCADO ALFA", amountCents: 10000, categoryId: CAT.MERCADO, kind: "avista", ownerUserId: null }));
    const hidden = hiddenTotalsToTx(
      ["2026-08", "2026-09"].map((m) => ({ statementMonth: m, categoryId: CAT.LAZER, ownerUserId: "bia", totalCents: 7000, count: 3 })),
      () => "Bia",
    );
    const all = [...base, ...hidden];
    expect(totalSpent(all.filter((t) => t.statementMonth === "2026-09"))).toBe(17000);
    expect(topMerchants(all.filter((t) => t.statementMonth === "2026-09")).map((m) => m.label)).toEqual(["Mercado Alfa"]);
    expect(detectRecurring(all, "2026-09").items.map((i) => i.label)).not.toContain("Gasto pessoal (Bia)");
  });

  it("a conferência do parceiro fecha somando os totais ocultos", () => {
    const d = drafts.get("2026-09")!;
    const declared = { totalDueCents: d.statement.declaredTotalCents, previousBalanceCents: d.statement.declaredPreviousBalanceCents, expensesCents: d.statement.declaredExpensesCents, expensesUsdCents: d.statement.declaredExpensesUsdCents, paymentsCents: d.statement.declaredPaymentsCents, creditsCents: d.statement.declaredCreditsCents, futureObligationsCents: d.statement.declaredFutureCents };
    // o parceiro não vê 3 lançamentos (um deles parcelado)
    const hiddenIdx = [d.transactions.findIndex((t) => t.kind === "avista" && t.amountUsdCents === null), d.transactions.length - 1 - [...d.transactions].reverse().findIndex((t) => t.kind === "avista" && t.amountCents > 5000 && t.amountUsdCents === null), d.transactions.findIndex((t) => t.kind === "parcela")];
    const hiddenSet = new Set(hiddenIdx);
    expect(hiddenSet.size).toBe(3);
    const visible = d.transactions.filter((_, i) => !hiddenSet.has(i));
    const hid = d.transactions.filter((_, i) => hiddenSet.has(i));
    const hidden = {
      expensesCents: hid.reduce((a, t) => a + t.amountCents, 0),
      expensesUsdCents: 0,
      futureCents: hid.filter((t) => t.kind === "parcela").reduce((a, t) => a + (t.installmentTotal! - t.installmentN!) * t.amountCents, 0),
      remainingInstallments: hid.filter((t) => t.kind === "parcela").reduce((a, t) => a + (t.installmentTotal! - t.installmentN!), 0),
    };
    const without = reconcile(declared, visible);
    expect(without.status).toBe("fail"); // sem o ajuste, o parceiro veria "não bate"
    const withHidden = reconcile(declared, visible, hidden);
    expect(withHidden.status).toBe("ok");
    expect(withHidden.totalDiffCents).toBe(0);
  });
});

import { budgetAlertMessage, importMessage } from "../src/notifications.ts";
describe("mensagens de push", () => {
  it("80% e 100% em português, com valores em R$", () => {
    const st = budgetStatuses(new Map([[CAT.RESTAURANTE, 100000]]), [{ statementMonth: "2026-09", postedOn: "2026-09-01", descriptionRaw: "X", amountCents: 85000, categoryId: CAT.RESTAURANTE, kind: "avista", ownerUserId: null }]);
    const [a] = pendingAlerts(st, "2026-09", new Set());
    expect(budgetAlertMessage(a!)).toEqual({
      title: "Alimentação (restaurante/delivery) chegou a 85% do orçamento",
      body: "R$ 850,00 de R$ 1.000,00; restam R$ 150,00 na fatura de set/26.",
      data: { type: "budget", route: "/orcamento", month: "2026-09", categoryId: CAT.RESTAURANTE },
    });
    const over = budgetStatuses(new Map([[CAT.RESTAURANTE, 100000]]), [{ statementMonth: "2026-09", postedOn: "2026-09-01", descriptionRaw: "X", amountCents: 112000, categoryId: CAT.RESTAURANTE, kind: "avista", ownerUserId: null }]);
    expect(budgetAlertMessage(pendingAlerts(over, "2026-09", new Set())[0]!).title).toBe("Orçamento estourado: Alimentação (restaurante/delivery)");
  });
  it("aviso de importação leva para Revisar quando há pendências", () => {
    expect(importMessage({ byName: "Ana", month: "2026-09", count: 94, reviewCount: 20 })).toMatchObject({ title: "Ana confirmou a fatura de set/26", body: "94 lançamentos. 20 para revisar.", data: { route: "/revisar" } });
    expect(importMessage({ byName: "Ana", month: "2026-09", count: 5, reviewCount: 0 }).body).toBe("5 lançamentos. Tudo categorizado.");
  });
});
