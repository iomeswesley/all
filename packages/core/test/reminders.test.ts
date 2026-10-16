import { describe, expect, it } from "vitest";
import type { PlannedExpense } from "../src/planned.ts";
import { isReminderLead, MAX_SCHEDULED_REMINDERS, plannedReminders, reminderMessage, splitFireAt } from "../src/reminders.ts";

const plan = (p: Partial<PlannedExpense> & Pick<PlannedExpense, "firstDate">): PlannedExpense => ({
  id: p.id ?? "p1", description: p.description ?? "IPVA", amountCents: p.amountCents ?? 150000, repeat: p.repeat ?? "once", occurrences: p.occurrences ?? null, categoryId: null, ...p,
});

describe("lembretes de gasto futuro", () => {
  it("avisa N dias antes e no dia, às 9h, com texto curto", () => {
    const r = plannedReminders([plan({ firstDate: "2026-10-25" })], { now: "2026-10-16T10:00", leadDays: 3 });
    expect(r.map((x) => [x.id, x.fireAt, x.kind])).toEqual([
      ["planned:p1:2026-10-25:before", "2026-10-22T09:00", "before"],
      ["planned:p1:2026-10-25:day", "2026-10-25T09:00", "day"],
    ]);
    expect(r[0]!.title).toBe("Gasto futuro em 3 dias");
    expect(r[0]!.body).toBe("IPVA · R$ 1.500,00 · 25/10");
    expect(r[1]!.title).toBe("Gasto futuro hoje");
    expect(r[1]!.body).toBe("IPVA · R$ 1.500,00");
  });

  it("antecedência de 1 dia diz 'amanhã'; 7 dias funciona", () => {
    expect(plannedReminders([plan({ firstDate: "2026-10-25" })], { now: "2026-10-16", leadDays: 1 })[0]!.title).toBe("Gasto futuro amanhã");
    expect(plannedReminders([plan({ firstDate: "2026-10-25" })], { now: "2026-10-16", leadDays: 7 })[0]!.fireAt).toBe("2026-10-18T09:00");
  });

  it("pula avisos cujo horário já passou", () => {
    // ocorrência amanhã: o aviso de 3 dias antes já passou, só fica o do dia
    const tomorrow = plannedReminders([plan({ firstDate: "2026-10-17" })], { now: "2026-10-16T08:00", leadDays: 3 });
    expect(tomorrow.map((x) => x.kind)).toEqual(["day"]);
    // ocorrência hoje: antes das 9h ainda avisa; depois, não
    expect(plannedReminders([plan({ firstDate: "2026-10-16" })], { now: "2026-10-16T08:59", leadDays: 3 })).toHaveLength(1);
    expect(plannedReminders([plan({ firstDate: "2026-10-16" })], { now: "2026-10-16T09:00", leadDays: 3 })).toHaveLength(0);
    // passado não gera nada
    expect(plannedReminders([plan({ firstDate: "2026-10-01" })], { now: "2026-10-16", leadDays: 3 })).toEqual([]);
  });

  it("séries mensais: uma dupla de avisos por ocorrência, com o rótulo 2/3", () => {
    const r = plannedReminders([plan({ id: "esc", description: "Escola", firstDate: "2026-09-10", repeat: "monthly", occurrences: 3, amountCents: 90000 })], { now: "2026-10-01", leadDays: 3 });
    expect(r.map((x) => x.fireAt)).toEqual(["2026-10-07T09:00", "2026-10-10T09:00", "2026-11-07T09:00", "2026-11-10T09:00"]);
    expect(r[0]!.body).toBe("Escola (2/3) · R$ 900,00 · 10/10");
  });

  it("ordena por disparo, respeita o teto e o horizonte", () => {
    const items = [
      plan({ id: "a", firstDate: "2026-11-05" }),
      plan({ id: "b", firstDate: "2026-10-20" }),
      plan({ id: "aluguel", firstDate: "2026-10-18", repeat: "monthly", occurrences: null }),
    ];
    const all = plannedReminders(items, { now: "2026-10-16", leadDays: 3 });
    expect(all.map((x) => x.fireAt)).toEqual([...all.map((x) => x.fireAt)].sort());
    expect(all[0]!.id).toBe("planned:b:2026-10-20:before"); // 17/10, antes do "no dia" do aluguel (18/10)
    expect(all.every((x) => x.occurrenceDate <= "2027-02-13")).toBe(true); // 120 dias
    expect(all.length).toBeLessThanOrEqual(MAX_SCHEDULED_REMINDERS);
    expect(plannedReminders(items, { now: "2026-10-16", leadDays: 3, limit: 3 })).toHaveLength(3);
    // série sem fim por 10 anos: nunca passa do teto
    const many = plannedReminders([plan({ id: "x", firstDate: "2026-10-20", repeat: "monthly" })], { now: "2026-10-16", leadDays: 3, horizonDays: 3650 });
    expect(many).toHaveLength(MAX_SCHEDULED_REMINDERS);
  });

  it("ids estáveis (reagendar não duplica) e únicos", () => {
    const items = [plan({ id: "a", firstDate: "2026-10-30", repeat: "monthly", occurrences: 6 }), plan({ id: "b", firstDate: "2026-12-01" })];
    const r1 = plannedReminders(items, { now: "2026-10-16T12:00", leadDays: 7 });
    const r2 = plannedReminders(items, { now: "2026-10-16T12:30", leadDays: 7 });
    expect(r1.map((x) => x.id)).toEqual(r2.map((x) => x.id));
    expect(new Set(r1.map((x) => x.id)).size).toBe(r1.length);
  });

  it("modo privacidade esconde o valor; hora configurável", () => {
    const [r] = plannedReminders([plan({ firstDate: "2026-10-25" })], { now: "2026-10-16", leadDays: 3, hideAmounts: true, hour: 20 });
    expect(r!.body).toBe("IPVA · 25/10");
    expect(r!.fireAt).toBe("2026-10-22T20:00");
    expect(reminderMessage({ description: "Viagem", amountCents: 100, date: "2026-12-01" }, 0, true)).toEqual({ title: "Gasto futuro hoje", body: "Viagem" });
  });

  it("utilitários", () => {
    expect(splitFireAt("2026-10-22T09:05")).toEqual({ y: 2026, m: 10, d: 22, hh: 9, mm: 5 });
    expect(() => splitFireAt("2026-10-22")).toThrow();
    expect([1, 3, 7, 2, "3", null].map(isReminderLead)).toEqual([true, true, true, false, false, false]);
  });
});
