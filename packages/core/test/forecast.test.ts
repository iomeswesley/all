import { describe, expect, it } from "vitest";
import type { AnalyticsTx } from "../src/analytics.ts";
import { forecastMonths, forecastStart, monthHistory } from "../src/forecast.ts";
import { occurrencesBetween, parsePlannedDate, plannedByMonth, plannedEnded, repeatSummary, upcomingPlanned, validatePlanned, type PlannedExpense } from "../src/planned.ts";

const tx = (statementMonth: string, amountCents: number, kind: AnalyticsTx["kind"] = "avista"): AnalyticsTx => ({
  statementMonth, postedOn: `${statementMonth}-05`, descriptionRaw: "X", amountCents, categoryId: 1, kind, ownerUserId: null,
});
const plan = (p: Partial<PlannedExpense> & Pick<PlannedExpense, "firstDate">): PlannedExpense => ({
  id: p.id ?? "p", description: p.description ?? "IPVA", amountCents: p.amountCents ?? 100000, repeat: p.repeat ?? "once", occurrences: p.occurrences ?? null, categoryId: null, ...p,
});

describe("gastos planejados", () => {
  it("validação: descrição, valor, data e repetições", () => {
    const ok = { description: "IPVA", amountCents: 150000, firstDate: "2027-01-20", repeat: "once" as const, occurrences: null, categoryId: null };
    expect(validatePlanned(ok)).toBeNull();
    expect(validatePlanned({ ...ok, description: "  " })).toMatch(/Diga/);
    expect(validatePlanned({ ...ok, amountCents: 0 })).toMatch(/maior que zero/);
    expect(validatePlanned({ ...ok, firstDate: "2027-02-30" })).toMatch(/inexistente/);
    expect(validatePlanned({ ...ok, firstDate: "20/01/2027" })).toMatch(/inválida/);
    expect(validatePlanned({ ...ok, repeat: "monthly", occurrences: 0 })).toMatch(/Repetições/);
    expect(validatePlanned({ ...ok, repeat: "monthly", occurrences: null })).toBeNull();
  });

  it("mensal mantém o dia e limita ao fim do mês; série finita numera 1/n", () => {
    const p = plan({ firstDate: "2026-10-31", repeat: "monthly", occurrences: 4 });
    const occ = occurrencesBetween(p, "2026-01-01", "2027-12-31");
    expect(occ.map((o) => o.date)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31"]);
    expect(occ.map((o) => o.label)).toEqual(["1/4", "2/4", "3/4", "4/4"]);
  });

  it("série sem fim que começou há anos acha as ocorrências da janela", () => {
    const p = plan({ firstDate: "2019-03-10", repeat: "monthly", occurrences: null });
    expect(occurrencesBetween(p, "2026-11-01", "2027-01-31").map((o) => o.date)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
    const y = plan({ firstDate: "2020-02-29", repeat: "yearly", occurrences: null });
    expect(occurrencesBetween(y, "2027-01-01", "2028-12-31").map((o) => o.date)).toEqual(["2027-02-28", "2028-02-29"]);
  });

  it("agrupa por mês e lista os próximos em ordem", () => {
    const items = [plan({ id: "a", firstDate: "2027-01-20", amountCents: 150000 }), plan({ id: "b", firstDate: "2026-11-05", repeat: "monthly", occurrences: 3, amountCents: 20000 })];
    const by = plannedByMonth(items, ["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect([...by].map(([k, v]) => [k, v.totalCents])).toEqual([["2026-11", 20000], ["2026-12", 20000], ["2027-01", 170000], ["2027-02", 0]]);
    expect(upcomingPlanned(items, "2026-11-06", 90).map((o) => `${o.id}@${o.date}`)).toEqual(["b@2026-12-05", "b@2027-01-05", "a@2027-01-20"]);
  });

  it("data digitada: dd/mm vai para a próxima vez que a data chega", () => {
    expect(parsePlannedDate("20/01", "2026-10-16")).toBe("2027-01-20");
    expect(parsePlannedDate("5/12", "2026-10-16")).toBe("2026-12-05");
    expect(parsePlannedDate("16/10", "2026-10-16")).toBe("2026-10-16");
    expect(parsePlannedDate("29/02", "2026-10-16")).toBeNull(); // 2027 não é bissexto
    expect(parsePlannedDate("20/01/2028", "2026-10-16")).toBe("2028-01-20");
    expect(parsePlannedDate("31/04/2027", "2026-10-16")).toBeNull();
    expect(parsePlannedDate("amanhã", "2026-10-16")).toBeNull();
  });

  it("resumo e fim da série", () => {
    expect(repeatSummary({ repeat: "once", occurrences: null })).toBe("Uma vez");
    expect(repeatSummary({ repeat: "monthly", occurrences: 10 })).toBe("Todo mês · 10x");
    expect(plannedEnded(plan({ firstDate: "2026-01-10", repeat: "monthly", occurrences: 3 }), "2026-04-01")).toBe(true);
    expect(plannedEnded(plan({ firstDate: "2026-01-10", repeat: "monthly", occurrences: null }), "2030-01-01")).toBe(false);
  });
});

describe("previsão dos próximos 6 meses", () => {
  // 6 meses de histórico: 1.000, 1.200, (sem dados), 900, 1.100, 1.300 (+ um pagamento de fatura que não conta)
  const txs = [
    tx("2026-05", 100000), tx("2026-06", 120000), tx("2026-08", 90000), tx("2026-09", 110000), tx("2026-10", 130000),
    tx("2026-10", -500000, "pagamento"),
  ];

  it("histórico com variação e mês vazio", () => {
    const h = monthHistory(txs, "2026-10", 6);
    expect(h.map((m) => [m.monthKey, m.totalCents, m.changePct])).toEqual([
      ["2026-05", 100000, null], ["2026-06", 120000, 20], ["2026-07", null, null], ["2026-08", 90000, -25], ["2026-09", 110000, 22], ["2026-10", 130000, 18],
    ]);
  });

  it("média dos meses com dados + planejados do mês; renda opcional", () => {
    const planned = [plan({ id: "ipva", firstDate: "2027-01-20", amountCents: 250000 }), plan({ id: "escola", firstDate: "2026-11-10", repeat: "monthly", occurrences: null, amountCents: 50000 })];
    const f = forecastMonths({ txs, lastMonth: "2026-10", planned, today: "2026-10-16", incomeCents: 2000000 });
    expect(f.basisMonths).toBe(5);
    expect(f.baselineCents).toBe(110000); // (1000+1200+900+1100+1300)/5
    expect(f.months.map((m) => m.monthKey)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
    expect(f.months.map((m) => m.totalCents)).toEqual([160000, 160000, 410000, 160000, 160000, 160000]);
    expect(f.months[2]!.planned.map((o) => o.id)).toEqual(["escola", "ipva"]);
    expect(f.months[0]!.netCents).toBe(2000000 - 160000);
    expect(f.peak?.monthKey).toBe("2027-01");
    expect(f.totalCents).toBe(160000 * 5 + 410000);
    // identidade: total = base + planejado em todo mês
    for (const m of f.months) expect(m.totalCents).toBe(m.baselineCents + m.plannedCents);
  });

  it("sem renda, sem saldo; sem histórico, base zero", () => {
    const f = forecastMonths({ txs: [], lastMonth: "2026-10", planned: [plan({ firstDate: "2026-12-01" })], today: "2026-10-16" });
    expect(f.baselineCents).toBe(0);
    expect(f.months[1]!.totalCents).toBe(100000);
    expect(f.months.every((m) => m.netCents === null)).toBe(true);
  });

  it("começa no mês corrente quando a última fatura é antiga, sem contar o que já passou", () => {
    expect(forecastStart("2026-10", "2026-10-16")).toBe("2026-11");
    expect(forecastStart("2026-07", "2026-10-16")).toBe("2026-10");
    const planned = [plan({ id: "ontem", firstDate: "2026-10-15" }), plan({ id: "amanha", firstDate: "2026-10-17", amountCents: 5000 })];
    const f = forecastMonths({ txs, lastMonth: "2026-07", planned, today: "2026-10-16" });
    expect(f.months[0]!.monthKey).toBe("2026-10");
    expect(f.months[0]!.planned.map((o) => o.id)).toEqual(["amanha"]);
  });
});
