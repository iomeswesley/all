import { describe, expect, it } from "vitest";
import type { AnalyticsTx } from "../src/analytics.ts";
import type { PlannedExpense } from "../src/planned.ts";
import { buildWidgetPayload, parseWidgetPayload, shortText, signedOutWidgetPayload, WIDGET_MASK, widgetPayloadFromData, widgetUpdatedLabel } from "../src/widget.ts";

const at = new Date(2026, 9, 16, 9, 5); // 16/10/2026 09:05 local
const tx = (statementMonth: string, amountCents: number): AnalyticsTx => ({
  statementMonth, postedOn: `${statementMonth}-05`, descriptionRaw: "X", amountCents, categoryId: 1, kind: "avista", ownerUserId: null,
});
const plan = (p: Partial<PlannedExpense> & Pick<PlannedExpense, "firstDate">): PlannedExpense => ({
  id: p.id ?? "p", description: p.description ?? "IPVA", amountCents: p.amountCents ?? 120000, repeat: p.repeat ?? "once", occurrences: p.occurrences ?? null, categoryId: null, ...p,
});

describe("widget: textos curtos", () => {
  it("shortText corta com reticências e normaliza espaços", () => {
    expect(shortText("  IPVA   do carro ")).toBe("IPVA do carro");
    expect(shortText("Viagem para Florianópolis em janeiro")).toBe("Viagem para Florianóp…");
    expect(shortText("Viagem para Florianópolis em janeiro").length).toBeLessThanOrEqual(22);
    expect(shortText("abcdef ghij", 8)).toBe("abcdef…");
  });

  it("rótulo de atualização usa hora local com zero à esquerda", () => {
    expect(widgetUpdatedLabel(at)).toBe("Atualizado 16/10 09:05");
  });
});

describe("buildWidgetPayload", () => {
  const month = { monthKey: "2026-10", totalCents: 432100, baselineCents: 390000, plannedCents: 42100 };
  const next = { description: "IPVA", amountCents: 120000, date: "2026-10-20" };

  it("mostra previsto, média + planejado, próximo gasto e o atalho para /lancar", () => {
    const p = buildWidgetPayload({ month, next, privacy: false, updatedAt: at });
    expect(p).toMatchObject({
      v: 1,
      state: "ready",
      heading: "Previsto · out/26",
      amount: "R$ 4.321,00",
      detail: "Média R$ 3.900,00 + planejado R$ 421,00",
      next: { title: "IPVA", when: "20/10", amount: "R$ 1.200,00" },
      nextLine: "Próximo: IPVA · 20/10 · R$ 1.200,00",
      actionLabel: "+ Lançar",
      actionUrl: "financascasal://lancar",
      openUrl: "financascasal://planejar",
      updatedLabel: "Atualizado 16/10 09:05",
      privacy: false,
    });
  });

  it("modo privacidade: nenhum valor aparece", () => {
    const p = buildWidgetPayload({ month, next, privacy: true, updatedAt: at });
    expect(p.amount).toBe(`R$ ${WIDGET_MASK}`);
    expect(p.detail).toBe(`Média R$ ${WIDGET_MASK} + planejado R$ ${WIDGET_MASK}`);
    expect(p.next?.amount).toBe(`R$ ${WIDGET_MASK}`);
    expect(p.nextLine).toBe(`Próximo: IPVA · 20/10 · R$ ${WIDGET_MASK}`);
    // nenhum dígito de valor vaza (só data/hora)
    const values = [p.amount, p.detail, p.next?.amount].join(" ");
    expect(values).not.toMatch(/\d/);
    expect(p.privacy).toBe(true);
  });

  it("sem planejado no mês: detalhe sem valor de planejado", () => {
    const p = buildWidgetPayload({ month: { ...month, plannedCents: 0, totalCents: 390000 }, next: null, privacy: false, updatedAt: at });
    expect(p.detail).toBe("Média dos últimos meses");
    expect(p.next).toBeNull();
    expect(p.nextLine).toBe("Nenhum gasto futuro");
  });

  it("sem histórico: estado vazio, mas o atalho continua", () => {
    const p = buildWidgetPayload({ month: null, next, privacy: false, updatedAt: at });
    expect(p.state).toBe("empty");
    expect(p.amount).toBe("—");
    expect(p.detail).toMatch(/Confirme uma fatura/);
    expect(p.actionUrl).toBe("financascasal://lancar");
    expect(p.next?.title).toBe("IPVA");
  });

  it("scheme configurável", () => {
    const p = buildWidgetPayload({ month, next: null, privacy: false, updatedAt: at, scheme: "outroapp" });
    expect(p.actionUrl).toBe("outroapp://lancar");
  });
});

describe("widgetPayloadFromData", () => {
  it("usa a mesma previsão do app (média + planejados a partir de hoje) e o próximo gasto", () => {
    const txs = [tx("2026-08", 300000), tx("2026-09", 500000)];
    const planned = [
      plan({ id: "a", description: "Matrícula da escola", amountCents: 80000, firstDate: "2026-11-05" }),
      plan({ id: "b", description: "IPVA", amountCents: 120000, firstDate: "2026-10-20" }),
      plan({ id: "c", description: "Já passou", amountCents: 999900, firstDate: "2026-10-01" }),
    ];
    const p = widgetPayloadFromData({ txs, lastMonth: "2026-09", planned, today: "2026-10-16", privacy: false, updatedAt: at });
    // média (300000+500000)/2 = 400000; planejado de outubro a partir de hoje = 120000
    expect(p.heading).toBe("Previsto · out/26");
    expect(p.amount).toBe("R$ 5.200,00");
    expect(p.detail).toBe("Média R$ 4.000,00 + planejado R$ 1.200,00");
    expect(p.next).toEqual({ title: "IPVA", when: "20/10", amount: "R$ 1.200,00" });
  });

  it("sem fatura: estado vazio; próximo gasto além da janela não aparece", () => {
    const planned = [plan({ firstDate: "2027-12-01" })];
    const p = widgetPayloadFromData({ txs: [], lastMonth: undefined, planned, today: "2026-10-16", privacy: false, updatedAt: at, lookaheadDays: 30 });
    expect(p.state).toBe("empty");
    expect(p.next).toBeNull();
  });
});

describe("payload salvo", () => {
  it("deslogado não carrega valores", () => {
    const p = signedOutWidgetPayload(at);
    expect(p.state).toBe("signedOut");
    expect(p.amount).toBe("—");
    expect(p.next).toBeNull();
  });

  it("parseWidgetPayload aceita o próprio formato e rejeita lixo", () => {
    const p = buildWidgetPayload({ month: null, next: null, privacy: false, updatedAt: at });
    expect(parseWidgetPayload(JSON.stringify(p))).toEqual(p);
    expect(parseWidgetPayload(null)).toBeNull();
    expect(parseWidgetPayload("{")).toBeNull();
    expect(parseWidgetPayload(JSON.stringify({ v: 2, amount: "x" }))).toBeNull();
  });
});
