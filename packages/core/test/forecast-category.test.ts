import { describe, expect, it } from "vitest";
import type { AnalyticsTx } from "../src/analytics.ts";
import { effectiveBudgets } from "../src/budget.ts";
import { CAT } from "../src/categories.ts";
import { forecastMonths } from "../src/forecast.ts";
import { categoryBaselines, forecastByCategory, forecastVsBudget, type CategoryForecastMonth } from "../src/forecast-category.ts";
import type { PlannedExpense } from "../src/planned.ts";

const tx = (statementMonth: string, amountCents: number, categoryId: number | null = CAT.MERCADO, kind: AnalyticsTx["kind"] = "avista"): AnalyticsTx => ({
  statementMonth, postedOn: `${statementMonth}-05`, descriptionRaw: "X", amountCents, categoryId, kind, ownerUserId: null,
});
const plan = (p: Partial<PlannedExpense> & Pick<PlannedExpense, "firstDate">): PlannedExpense => ({
  id: p.id ?? "p", description: "IPVA", amountCents: 100000, repeat: "once", occurrences: null, categoryId: null, ...p,
});
const sum = (m: CategoryForecastMonth) => m.categories.reduce((a, c) => a + c.totalCents, 0);

/** gerador determinístico (LCG) para o teste de identidade com muitos casos */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

describe("previsão por categoria", () => {
  it("média por categoria nos meses com dados; planejado com e sem categoria", () => {
    const txs = [
      tx("2026-08", 60000, CAT.MERCADO), tx("2026-08", 30000, CAT.LAZER),
      tx("2026-09", 40000, CAT.MERCADO), tx("2026-09", 10000, null), // sem categoria → Outros
      tx("2026-09", 999999, CAT.MERCADO, "pagamento"), // pagamento de fatura não conta
    ];
    const planned = [plan({ id: "a", firstDate: "2026-11-10", amountCents: 50000, categoryId: CAT.VIAGEM }), plan({ id: "b", firstDate: "2026-11-20", amountCents: 7000 })];
    const input = { txs, lastMonth: "2026-10", planned, today: "2026-10-16" };
    const [nov] = forecastByCategory(input);
    expect(nov!.monthKey).toBe("2026-11");
    const by = new Map(nov!.categories.map((c) => [c.categoryId, c]));
    expect(by.get(CAT.MERCADO)).toEqual({ categoryId: CAT.MERCADO, baselineCents: 50000, plannedCents: 0, totalCents: 50000 });
    expect(by.get(CAT.LAZER)!.totalCents).toBe(15000);
    expect(by.get(CAT.OUTROS)).toEqual({ categoryId: CAT.OUTROS, baselineCents: 5000, plannedCents: 7000, totalCents: 12000 });
    expect(by.get(CAT.VIAGEM)!.plannedCents).toBe(50000);
    expect(nov!.categories[0]!.categoryId).toBe(CAT.MERCADO); // maior primeiro
    expect(sum(nov!)).toBe(forecastMonths(input).months[0]!.totalCents);
  });

  it("arredondamento: os centavos que sobram vão para os maiores restos e a soma bate", () => {
    // 3 meses; cada categoria soma 1 → média 0,333… cada; total 3/3 = 1
    const txs = [tx("2026-01", 1, 1), tx("2026-02", 1, 2), tx("2026-03", 1, 3)];
    const base = categoryBaselines(txs, "2026-03");
    expect([...base.values()].reduce((a, v) => a + v, 0)).toBe(1);
    expect(base.get(1)).toBe(1); // empate no resto → menor id
    // 2 meses: 3 + 3 = 6 centavos em 2 categorias → 1,5 + 1,5 = 3 (round(3)) — sem centavo extra
    const b2 = categoryBaselines([tx("2026-02", 3, 1), tx("2026-03", 3, 2)], "2026-03");
    expect(b2.get(1)! + b2.get(2)!).toBe(3);
  });

  it("estorno maior que o gasto deixa a categoria negativa, mas a identidade continua", () => {
    const txs = [tx("2026-08", 10001, CAT.MERCADO), tx("2026-09", -5000, CAT.COMPRAS, "estorno"), tx("2026-09", 333, CAT.LAZER)];
    const input = { txs, lastMonth: "2026-09", planned: [], today: "2026-10-01" };
    const months = forecastByCategory(input);
    const f = forecastMonths(input);
    months.forEach((m, i) => expect(sum(m)).toBe(f.months[i]!.totalCents));
  });

  it("identidade com forecastMonths em 500 cenários aleatórios", () => {
    const r = rng(42);
    const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
    for (let k = 0; k < 500; k++) {
      const txs: AnalyticsTx[] = [];
      for (const m of months) {
        if (r() < 0.25) continue; // mês sem dados
        const n = 1 + Math.floor(r() * 12);
        for (let i = 0; i < n; i++) {
          const cat = r() < 0.1 ? null : 1 + Math.floor(r() * 12);
          const kind = r() < 0.05 ? "estorno" : r() < 0.05 ? "pagamento" : "avista";
          const amount = Math.floor(r() * 50000) + 1;
          txs.push(tx(m, kind === "estorno" ? -amount : amount, cat, kind));
        }
      }
      const planned = Array.from({ length: Math.floor(r() * 4) }, (_, i) =>
        plan({ id: `p${i}`, firstDate: `2026-${10 + Math.floor(r() * 3)}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`, amountCents: 1 + Math.floor(r() * 90000), repeat: r() < 0.5 ? "monthly" : "once", categoryId: r() < 0.5 ? null : 1 + Math.floor(r() * 12) }),
      );
      const input = { txs, lastMonth: "2026-09", planned, today: "2026-10-16" };
      const f = forecastMonths(input);
      const byCat = forecastByCategory(input, f);
      expect(byCat).toHaveLength(f.months.length);
      byCat.forEach((m, i) => {
        expect(m.totalCents).toBe(f.months[i]!.totalCents);
        expect(sum(m)).toBe(f.months[i]!.totalCents);
        expect(m.categories.reduce((a, c) => a + c.baselineCents, 0)).toBe(f.baselineCents);
        expect(m.categories.reduce((a, c) => a + c.plannedCents, 0)).toBe(f.months[i]!.plannedCents);
      });
    }
  });

  it("sem histórico: só os planejados", () => {
    const input = { txs: [], lastMonth: "2026-09", planned: [plan({ firstDate: "2026-10-20", amountCents: 1234, categoryId: CAT.SAUDE })], today: "2026-10-16" };
    const [oct] = forecastByCategory(input);
    expect(oct!.categories).toEqual([{ categoryId: CAT.SAUDE, baselineCents: 0, plannedCents: 1234, totalCents: 1234 }]);
  });
});

describe("previsão × orçamento", () => {
  const month: CategoryForecastMonth = {
    monthKey: "2026-11",
    totalCents: 0,
    categories: [
      { categoryId: CAT.MERCADO, baselineCents: 100000, plannedCents: 0, totalCents: 100000 },
      { categoryId: CAT.LAZER, baselineCents: 30000, plannedCents: 20000, totalCents: 50000 },
      { categoryId: CAT.RESTAURANTE, baselineCents: 40000, plannedCents: 0, totalCents: 40000 },
      { categoryId: CAT.CASA, baselineCents: 7000, plannedCents: 0, totalCents: 7000 },
    ],
  };

  it("ok / perto (≥80%) / estoura (≥100%), com quanto passa", () => {
    const limits = new Map([[CAT.MERCADO, 100000], [CAT.LAZER, 60000], [CAT.RESTAURANTE, 80000], [CAT.SAUDE, 20000]]);
    const cmp = forecastVsBudget(month, limits);
    const by = new Map(cmp.rows.map((r) => [r.categoryId, r]));
    expect(by.get(CAT.MERCADO)).toMatchObject({ level: "estoura", percent: 100, overCents: 0 }); // exatamente 100% já estoura
    expect(by.get(CAT.LAZER)).toMatchObject({ level: "perto", percent: 83 });
    expect(by.get(CAT.RESTAURANTE)).toMatchObject({ level: "ok", percent: 50 });
    expect(by.get(CAT.SAUDE)).toMatchObject({ totalCents: 0, level: "ok", percent: 0 }); // limite sem previsão aparece
    expect(by.get(CAT.CASA)).toMatchObject({ limitCents: null, level: null, percent: null });
    expect(cmp.rows.map((r) => r.categoryId)).toEqual([CAT.MERCADO, CAT.LAZER, CAT.RESTAURANTE, CAT.SAUDE, CAT.CASA]);
    expect([cmp.over, cmp.near]).toEqual([1, 1]);
  });

  it("passa do limite: overCents; 79,99% ainda é ok", () => {
    const cmp = forecastVsBudget(month, new Map([[CAT.MERCADO, 90000], [CAT.RESTAURANTE, 50001]]));
    const by = new Map(cmp.rows.map((r) => [r.categoryId, r]));
    expect(by.get(CAT.MERCADO)).toMatchObject({ level: "estoura", overCents: 10000, percent: 111 });
    expect(by.get(CAT.RESTAURANTE)!.level).toBe("ok");
  });

  it("usa o orçamento efetivo do mês previsto", () => {
    const rows = [{ categoryId: CAT.MERCADO, month: "2026-01", limitCents: 200000 }, { categoryId: CAT.MERCADO, month: "2026-11", limitCents: 90000 }, { categoryId: CAT.LAZER, month: "2026-12", limitCents: 1 }];
    const cmp = forecastVsBudget(month, effectiveBudgets(rows, "2026-11"));
    expect(cmp.rows.find((r) => r.categoryId === CAT.MERCADO)!.level).toBe("estoura");
    expect(cmp.rows.find((r) => r.categoryId === CAT.LAZER)!.limitCents).toBeNull(); // limite só vale a partir de dezembro
  });
});
