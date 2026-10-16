import { describe, expect, it } from "vitest";
import type { CheckinTx } from "../src/checkin.ts";
import { CAT } from "../src/categories.ts";
import {
  buildMoneyDate, cancelReminder, MAX_AGREEMENTS, MONEY_DATE_MINUTES, MONEY_DATE_STEPS, moneyDateInMonth, moneyDateReminders, moneyDateText,
  nextMoneyDate, normalizeAgreements, previousAgreements, roundUpLimit, shouldSuggestMoneyDate, suggestAfterDay, weekdayOf,
} from "../src/money-date.ts";
import type { PlannedExpense } from "../src/planned.ts";

const tx = (statementMonth: string, amountCents: number, categoryId: number, descriptionRaw = "LOJA X", day = "05"): CheckinTx => ({
  statementMonth, postedOn: `${statementMonth}-${day}`, descriptionRaw, amountCents, categoryId, kind: "avista", ownerUserId: null,
});

const months = ["2026-07", "2026-08", "2026-09", "2026-10"];
const txs: CheckinTx[] = [
  ...months.map((m) => tx(m, 5590, CAT.ASSINATURAS, "NETFLIX.COM")),
  ...months.map((m) => tx(m, 2190, CAT.ASSINATURAS, "SPOTIFY")),
  ...months.slice(0, 3).map((m) => tx(m, 100000, CAT.MERCADO, "SUPERMERCADO BOM")),
  tx("2026-10", 140000, CAT.MERCADO, "SUPERMERCADO BOM"),
  tx("2026-10", 30000, CAT.RESTAURANTE, "RESTAURANTE NOVO"),
];
const planned: PlannedExpense[] = [{ id: "ipva", description: "IPVA", amountCents: 250000, firstDate: "2026-11-20", repeat: "once", occurrences: null, categoryId: null }];

describe("encontro do dinheiro: pauta", () => {
  it("7 passos fixos somando ~20 minutos", () => {
    expect(MONEY_DATE_STEPS.map((s) => s.id)).toEqual(["mes", "mudancas", "orcamento", "assinaturas", "proximo", "metas", "combinados"]);
    expect(MONEY_DATE_MINUTES).toBe(20);
  });

  it("monta os dados de cada passo a partir das faturas, orçamento, planejados e metas", () => {
    const md = buildMoneyDate({
      month: "2026-10", txs, budgets: new Map([[CAT.MERCADO, 120000], [CAT.ASSINATURAS, 10000]]), planned, today: "2026-10-16",
      goals: [{ id: "g", name: "Viagem", targetCents: 600000, savedCents: 150000, dueDate: "2027-04-16" }], incomeCents: 1000000,
    });
    // 1) mês: total, vs anterior e vs previsão (média de jul–set = 107.780)
    expect(md.overview.totalCents).toBe(5590 + 2190 + 140000 + 30000);
    expect(md.overview.prevTotalCents).toBe(107780);
    expect(md.overview.deltaCents).toBe(177780 - 107780);
    expect(md.overview.forecastCents).toBe(107780);
    expect(md.overview.vsForecastCents).toBe(70000);
    // 2) mudanças
    expect(md.changes.risers.map((r) => r.label)).toContain("Alimentação (mercado)");
    expect(md.changes.newMerchants.length).toBeGreaterThan(0);
    // 3) orçamento: mercado estourou, sugestão arredondada para cima em R$ 50
    expect(md.budget.adjust.map((b) => [b.categoryId, b.level, b.suggestedLimitCents])).toEqual([[CAT.MERCADO, "over100", 140000]]);
    expect(md.budget.okCount).toBe(1);
    // 4) assinaturas ativas, mais cara primeiro
    expect(md.subscriptions.items.map((s) => s.typicalCents)).toEqual([5590, 2190]);
    expect(md.subscriptions.items[0]!.categoryId).toBe(CAT.ASSINATURAS);
    // 5) próximo mês: média + IPVA
    expect(md.nextMonth).toBe("2026-11");
    expect(md.next!.plannedCents).toBe(250000);
    expect(md.next!.netCents).toBe(1000000 - md.next!.totalCents);
    // 6) metas
    expect(md.goals[0]!.progress).toMatchObject({ percent: 25, monthsLeft: 6, monthlyNeededCents: 75000 });
  });

  it("primeira fatura: sem comparação nem previsão", () => {
    const md = buildMoneyDate({ month: "2026-07", txs: txs.filter((t) => t.statementMonth === "2026-07"), today: "2026-07-20" });
    expect(md.overview.prevTotalCents).toBeNull();
    expect(md.overview.forecastCents).toBeNull();
    expect(md.overview.vsForecastCents).toBeNull();
    expect(md.budget.hasBudgets).toBe(false);
  });

  it("arredonda limite para múltiplo de R$ 50", () => {
    expect(roundUpLimit(0)).toBe(5000);
    expect(roundUpLimit(123401)).toBe(125000);
    expect(roundUpLimit(125000)).toBe(125000);
  });
});

describe("combinados", () => {
  it("limpa, tira repetidos e guarda no máximo 3 de até 80 caracteres", () => {
    expect(normalizeAgreements(["  pedir   menos iFood ", "", "Pedir menos ifood", "levar marmita", "cozinhar sábado", "outro"])).toEqual(["pedir menos iFood", "levar marmita", "cozinhar sábado"]);
    expect(normalizeAgreements(["x".repeat(120)])[0]).toHaveLength(80);
    expect(MAX_AGREEMENTS).toBe(3);
  });

  it("reaparecem os do último encontro concluído antes do mês", () => {
    const recs = [
      { month: "2026-08", agreements: ["a"], completedAt: "2026-08-15T10:00:00Z" },
      { month: "2026-09", agreements: ["pedir menos iFood"], completedAt: "2026-09-12T10:00:00Z" },
      { month: "2026-10", agreements: ["rascunho"], completedAt: null },
    ];
    expect(previousAgreements(recs, "2026-10")).toEqual({ month: "2026-09", agreements: ["pedir menos iFood"] });
    expect(previousAgreements(recs, "2026-08")).toBeNull();
  });
});

describe("data do encontro", () => {
  it("dia da semana", () => {
    expect(weekdayOf("2026-10-17")).toBe(6); // sábado
    expect(weekdayOf("2026-10-18")).toBe(0);
  });

  it("primeiro sábado a partir do dia seguinte ao vencimento", () => {
    expect(moneyDateInMonth("2026-10", { weekday: 6, afterDay: 11 })).toBe("2026-10-17");
    expect(moneyDateInMonth("2026-10", { weekday: 6, afterDay: 17 })).toBe("2026-10-17");
    expect(moneyDateInMonth("2026-11", { weekday: 0, afterDay: 31 })).toBe("2026-12-06"); // dia 31 vira 30/11 (segunda) → domingo seguinte
    expect(nextMoneyDate("2026-10-16", { weekday: 6, afterDay: 11 })).toBe("2026-10-17");
    expect(nextMoneyDate("2026-10-18", { weekday: 6, afterDay: 11 })).toBe("2026-11-14");
    expect(suggestAfterDay("2026-10-10")).toBe(11);
    expect(suggestAfterDay("2026-10-30")).toBe(28);
    expect(suggestAfterDay(null)).toBe(11);
  });

  it("lembretes mensais com id estável e título com o mês", () => {
    const r = moneyDateReminders({ now: "2026-10-17T11:00", schedule: { weekday: 6, afterDay: 11 } });
    expect(r.map((x) => [x.id, x.fireAt])).toEqual([
      ["money-date:2026-11-14", "2026-11-14T10:00"],
      ["money-date:2026-12-12", "2026-12-12T10:00"],
      ["money-date:2027-01-16", "2027-01-16T10:00"],
    ]);
    expect(r[0]!.title).toBe("Encontro do dinheiro de novembro — 20 min");
    expect(moneyDateReminders({ now: "2026-10-17T09:00", schedule: { weekday: 6, afterDay: 11 }, count: 1 })[0]!.title).toBe("Encontro do dinheiro de outubro — 20 min");
  });

  it("lembrete de cancelar assinatura no dia seguinte; esconde valor no modo privacidade", () => {
    const r = cancelReminder({ key: "netflix", label: "Netflix", cents: 5590 }, "2026-10-17");
    expect(r).toMatchObject({ id: "money-cancel:netflix", fireAt: "2026-10-18T19:00", title: "Cancelar Netflix" });
    expect(r.body).toContain("R$ 55,90");
    expect(cancelReminder({ key: "n", label: "N", cents: 5590 }, "2026-10-17", true).body).not.toContain("R$");
  });

  it("atalho no Início só no começo do mês e se o encontro não foi feito", () => {
    expect(shouldSuggestMoneyDate("2026-10-05", "2026-10", new Set())).toBe(true);
    expect(shouldSuggestMoneyDate("2026-10-20", "2026-10", new Set())).toBe(false);
    expect(shouldSuggestMoneyDate("2026-10-05", "2026-10", new Set(["2026-10"]))).toBe(false);
    expect(shouldSuggestMoneyDate("2026-10-05", undefined, new Set())).toBe(false);
  });

  it("texto para compartilhar", () => {
    const md = buildMoneyDate({ month: "2026-10", txs, planned, today: "2026-10-16" });
    const text = moneyDateText(md, ["pedir menos iFood"], [{ label: "Spotify", cents: 2190 }], "2026-11-14");
    expect(text).toContain("Encontro do dinheiro — outubro de 2026");
    expect(text).toContain("• pedir menos iFood");
    expect(text).toContain("• Spotify (R$ 21,90/mês)");
    expect(text).toContain("Próximo encontro: 14/11");
  });
});
