import { describe, expect, it } from "vitest";
import { buildCalendarMonth, expectedRecurringFrom, findCalendarDay, monthEvents, shiftCalendarMonth, weekday, type ExpectedRecurring } from "../src/calendar.ts";
import { merchantKey as keyOf } from "../src/normalize.ts";
import type { PlannedExpense } from "../src/planned.ts";
import type { RecurringItem, RecurringTx } from "../src/recurring.ts";

const plan = (p: Partial<PlannedExpense> & Pick<PlannedExpense, "firstDate">): PlannedExpense => ({
  id: p.id ?? "p", description: p.description ?? "IPVA", amountCents: p.amountCents ?? 100000, repeat: p.repeat ?? "once", occurrences: p.occurrences ?? null, categoryId: null, ...p,
});
const rec = (r: Partial<ExpectedRecurring> & Pick<ExpectedRecurring, "day">): ExpectedRecurring => ({
  key: r.key ?? "NETFLIX", label: r.label ?? "Netflix", amountCents: r.amountCents ?? 5590, categoryId: null, ...r,
});

describe("calendário do mês", () => {
  it("dia da semana (0 = domingo)", () => {
    expect(weekday("2026-02-01")).toBe(0);
    expect(weekday("2026-08-01")).toBe(6);
    expect(weekday("2026-10-16")).toBe(5);
  });

  it("fevereiro que começa no domingo cabe em 4 semanas, sem dias de fora", () => {
    const cal = buildCalendarMonth({ monthKey: "2026-02", planned: [] });
    expect(cal.weeks).toHaveLength(4);
    expect(cal.weeks.every((w) => w.length === 7)).toBe(true);
    expect(cal.weeks[0]![0]!.date).toBe("2026-02-01");
    expect(cal.weeks[3]![6]!.date).toBe("2026-02-28");
    expect(cal.weeks.flat().every((d) => d.inMonth)).toBe(true);
  });

  it("fevereiro bissexto: 29 dias e semanas completadas com janeiro/março", () => {
    const cal = buildCalendarMonth({ monthKey: "2028-02", planned: [] });
    const days = cal.weeks.flat();
    expect(days.filter((d) => d.inMonth)).toHaveLength(29);
    expect(days[0]!.date).toBe("2028-01-30"); // 01/02/2028 é terça
    expect(days[0]!.inMonth).toBe(false);
    expect(days.at(-1)!.date).toBe("2028-03-04");
    expect(days.length % 7).toBe(0);
  });

  it("mês que começa no sábado usa 6 semanas; dias de fora marcados e sem eventos", () => {
    const cal = buildCalendarMonth({ monthKey: "2026-08", planned: [plan({ firstDate: "2026-07-31", repeat: "monthly" })], recurring: [rec({ day: 1 })] });
    expect(cal.weeks).toHaveLength(6);
    const first = cal.weeks[0]!;
    expect(first.slice(0, 6).every((d) => !d.inMonth)).toBe(true);
    expect(first[0]!.date).toBe("2026-07-26");
    expect(first[6]!.date).toBe("2026-08-01");
    expect(first[6]!.inMonth).toBe(true);
    // 31/07 (planejado de julho) aparece só como dia de fora, sem evento
    expect(findCalendarDay(cal, "2026-07-31")!.events).toEqual([]);
    expect(findCalendarDay(cal, "2026-08-31")!.events.map((e) => e.kind)).toEqual(["planned"]);
    expect(findCalendarDay(cal, "2026-08-01")!.events.map((e) => e.kind)).toEqual(["recurring"]);
    expect(cal.weeks.at(-1)!.at(-1)!.date).toBe("2026-09-05");
  });

  it("dia 31 em mês de 30 cai no dia 30; em fevereiro, no 28", () => {
    const r = [rec({ day: 31 })];
    const p = [plan({ id: "a", firstDate: "2026-01-31", repeat: "monthly" })];
    expect(monthEvents("2026-09", p, r).map((e) => [e.kind, e.date])).toEqual([["planned", "2026-09-30"], ["recurring", "2026-09-30"]]);
    expect(monthEvents("2026-02", p, r).map((e) => e.date)).toEqual(["2026-02-28", "2026-02-28"]);
  });

  it("total por dia e do mês; planejados antes dos recorrentes no mesmo dia", () => {
    const cal = buildCalendarMonth({
      monthKey: "2026-10",
      planned: [plan({ id: "ipva", firstDate: "2026-10-10", amountCents: 150000 }), plan({ id: "viagem", firstDate: "2026-11-10" })],
      recurring: [rec({ day: 10, amountCents: 5590 }), rec({ key: "SPOTIFY", label: "Spotify", day: 20, amountCents: 2190 })],
      today: "2026-10-16",
    });
    const d10 = findCalendarDay(cal, "2026-10-10")!;
    expect(d10.events.map((e) => e.id)).toEqual(["ipva", "NETFLIX"]);
    expect(d10.totalCents).toBe(155590);
    expect(cal.totalCents).toBe(157780);
    expect(cal.plannedCents).toBe(150000);
    expect(cal.recurringCents).toBe(7780);
    expect(cal.busyDays).toBe(2);
    expect(cal.weeks.flat().filter((d) => d.isToday).map((d) => d.date)).toEqual(["2026-10-16"]);
  });

  it("série finita leva o rótulo n/total; recorrência não aparece antes de existir", () => {
    const p = [plan({ id: "movel", firstDate: "2026-09-05", repeat: "monthly", occurrences: 3 })];
    expect(monthEvents("2026-10", p).map((e) => e.note)).toEqual(["2/3"]);
    expect(monthEvents("2026-12", p)).toEqual([]);
    expect(monthEvents("2026-05", [], [rec({ day: 5, sinceMonth: "2026-06" })])).toEqual([]);
    expect(monthEvents("2026-06", [], [rec({ day: 5, sinceMonth: "2026-06" })])).toHaveLength(1);
  });

  it("anual só no mês certo", () => {
    const p = [plan({ firstDate: "2025-03-15", repeat: "yearly" })];
    expect(monthEvents("2027-03", p).map((e) => e.date)).toEqual(["2027-03-15"]);
    expect(monthEvents("2027-04", p)).toEqual([]);
  });

  it("navegação entre meses vira o ano", () => {
    expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12");
  });

  it("dia típico das recorrências ativas = mediana do dia de cobrança", () => {
    const tx = (postedOn: string, descriptionRaw = "NETFLIX.COM"): RecurringTx => ({ statementMonth: postedOn.slice(0, 7), postedOn, descriptionRaw, amountCents: 5590, categoryId: null, kind: "avista" });
    const txs = [tx("2026-07-12"), tx("2026-08-14"), tx("2026-09-13"), tx("2026-09-02", "PADARIA")];
    const item = (key: string, active: boolean): RecurringItem => ({ key, label: key, categoryId: null, months: ["2026-07", "2026-08", "2026-09"], lastCents: 5590, typicalCents: 5590, annualCents: 5590 * 12, inUsd: false, active, alerts: [] });
    const out = expectedRecurringFrom([item(keyOf("NETFLIX.COM"), true), item(keyOf("PADARIA"), false)], txs);
    expect(out).toHaveLength(1);
    expect(out[0]!.day).toBe(13);
    expect(out[0]!.sinceMonth).toBe("2026-07");
    expect(out[0]!.amountCents).toBe(5590);
  });
});
