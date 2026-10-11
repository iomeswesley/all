import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareMonths, monthlySeries, splitByOwner, topMerchants, totalByCategory, totalSpent, type AnalyticsTx } from "../src/analytics.ts";
import { CAT } from "../src/categories.ts";
import { buildDraft } from "../src/draft.ts";
import { futureInstallmentTimeline } from "../src/installments.ts";
import { parseSantanderStatement } from "../src/parsers/santander/index.ts";
import { detectRecurring, type RecurringTx } from "../src/recurring.ts";

const tx = (o: Partial<AnalyticsTx> & { amountCents: number }): AnalyticsTx => ({
  statementMonth: "2026-09", postedOn: "2026-08-10", descriptionRaw: "LOJA X", categoryId: CAT.COMPRAS, kind: "avista", ownerUserId: null, ...o,
});

describe("análises do dashboard", () => {
  const cur = [
    tx({ amountCents: 10000, categoryId: CAT.MERCADO, descriptionRaw: "GIASSI 1" }),
    tx({ amountCents: 5000, categoryId: CAT.MERCADO, descriptionRaw: "GIASSI 2" }),
    tx({ amountCents: 3000, categoryId: CAT.LAZER, descriptionRaw: "CINEMA" }),
    tx({ amountCents: 2000, categoryId: CAT.SAUDE, descriptionRaw: "PANVEL" }),
    tx({ amountCents: -1000, categoryId: CAT.SAUDE, kind: "estorno", descriptionRaw: "PANVEL" }),
    tx({ amountCents: -99999, categoryId: null, kind: "pagamento", descriptionRaw: "PAGAMENTO DE FATURA" }),
  ];
  const prev = [
    tx({ statementMonth: "2026-08", amountCents: 9000, categoryId: CAT.MERCADO, descriptionRaw: "GIASSI 3" }),
    tx({ statementMonth: "2026-08", amountCents: 4000, categoryId: CAT.VIAGEM, descriptionRaw: "HOTEL Z" }),
  ];

  it("rosca por categoria: valor e %, ignora pagamento e abate estorno", () => {
    const rows = totalByCategory(cur);
    expect(rows.map((r) => [r.categoryId, r.totalCents, r.percent])).toEqual([
      [CAT.MERCADO, 15000, 79],
      [CAT.LAZER, 3000, 16],
      [CAT.SAUDE, 1000, 5],
    ]);
    expect(totalSpent(cur)).toBe(10000 + 5000 + 3000 + 2000 - 1000);
  });

  it("variação vs mês anterior: subiu, caiu, novo e sumiu", () => {
    const c = Object.fromEntries(compareMonths(cur, prev, "category").map((x) => [x.key, x]));
    expect(c[String(CAT.MERCADO)]).toMatchObject({ status: "subiu", diffCents: 6000, percent: 67 });
    expect(c[String(CAT.LAZER)]).toMatchObject({ status: "novo", percent: null });
    expect(c[String(CAT.VIAGEM)]).toMatchObject({ status: "sumiu", diffCents: -4000 });
  });

  it("top estabelecimentos agrupa número de loja", () => {
    const top = topMerchants([tx({ amountCents: 100, descriptionRaw: "SAMS JOINVILLE AM 4672" }), tx({ amountCents: 300, descriptionRaw: "SAMS JOINVILLE AM 4673" }), tx({ amountCents: 50, descriptionRaw: "OUTRO" })], 10);
    expect(top[0]).toMatchObject({ totalCents: 400, count: 2 });
  });

  it("meu × dela × nosso depende de quem olha", () => {
    const txs = [tx({ amountCents: 100, ownerUserId: "ana" }), tx({ amountCents: 200, ownerUserId: "bia" }), tx({ amountCents: 400, ownerUserId: null })];
    expect(splitByOwner(txs, "ana")).toEqual({ mineCents: 100, partnerCents: 200, sharedCents: 400 });
    expect(splitByOwner(txs, "bia")).toEqual({ mineCents: 200, partnerCents: 100, sharedCents: 400 });
  });

  it("série de 12 meses termina no mês pedido e passa a virada de ano", () => {
    const s = monthlySeries([tx({ statementMonth: "2026-01", amountCents: 7 })], "2026-02", 12);
    expect(s.months[0]).toBe("2025-03");
    expect(s.months[11]).toBe("2026-02");
    expect(s.totals[10]).toBe(7);
  });
});

describe("recorrências (faturas de exemplo)", () => {
  const dir = path.resolve(import.meta.dirname, "../../../fixtures/santander");
  const all: (RecurringTx & { statementMonth: string })[] = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".items.json")).sort()) {
    const m = f.slice(0, 7);
    const draft = buildDraft(parseSantanderStatement(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))), { accountId: "a" });
    for (const t of draft.transactions) all.push({ ...t, statementMonth: m });
  }

  it("acha a assinatura em dólar e a cobrança mensal fixa, com custo anual", () => {
    const r = detectRecurring(all, "2026-10");
    const claude = r.items.find((i) => i.label.includes("Anthropic"))!;
    expect(claude).toMatchObject({ inUsd: true, active: true });
    expect(claude.annualCents).toBe(claude.typicalCents * 12);
    expect(r.items.some((i) => /Barbearia/.test(i.label))).toBe(true);
    expect(r.annualTotalCents).toBe(r.items.filter((i) => i.active).reduce((a, i) => a + i.annualCents, 0));
  });

  it("hábito diário (padaria) e estabelecimento muito frequente não viram recorrência", () => {
    const r = detectRecurring(all, "2026-10");
    const freq = new Map<string, number>();
    for (const t of all) freq.set(t.descriptionRaw, (freq.get(t.descriptionRaw) ?? 0) + 1);
    const [top] = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    expect(top![1]).toBeGreaterThan(20);
    expect(r.items.some((i) => i.key === top![0].replace(/\s+\d{2,}$/, ""))).toBe(false);
  });

  it("alerta de duplicidade quando a mesma assinatura cobra duas vezes no mês", () => {
    const mk = (statementMonth: string, day: string, amountCents: number): RecurringTx => ({ statementMonth, postedOn: `${statementMonth}-${day}`, descriptionRaw: "SPOTIFY", amountCents, categoryId: CAT.ASSINATURAS, kind: "avista" });
    const r = detectRecurring([mk("2026-08", "05", 2190), mk("2026-09", "05", 2190), mk("2026-09", "07", 2190)], "2026-09");
    expect(r.items[0]!.alerts).toContain("duplicada");
    // sem a cobrança extra, sem alerta
    expect(detectRecurring([mk("2026-08", "05", 2190), mk("2026-09", "05", 2190)], "2026-09").items[0]!.alerts).toEqual([]);
  });

  it("assinatura conhecida que aparece pela 1ª vez no último mês é 'nova'", () => {
    const novo: RecurringTx[] = [{ statementMonth: "2026-10", postedOn: "2026-09-20", descriptionRaw: "NETFLIX.COM", amountCents: 5590, categoryId: CAT.ASSINATURAS, kind: "avista" }];
    expect(detectRecurring(novo, "2026-10").newSubscriptions).toMatchObject([{ key: "NETFLIX.COM", amountCents: 5590 }]);
  });

  it("alerta de mudança de valor e encerramento", () => {
    const mk = (statementMonth: string, amountCents: number): RecurringTx => ({ statementMonth, postedOn: `${statementMonth}-05`, descriptionRaw: "ACADEMIA FIT", amountCents, categoryId: CAT.SAUDE, kind: "avista" });
    expect(detectRecurring([mk("2026-08", 10000), mk("2026-09", 10800)], "2026-09").items[0]!.alerts).toContain("mudou_valor");
    const ended = detectRecurring([mk("2026-07", 10000), mk("2026-08", 10000)], "2026-09").items[0]!;
    expect(ended).toMatchObject({ active: false });
    expect(ended.alerts).toContain("encerrada");
  });
});

describe("linha do tempo de parcelas", () => {
  it("projeta mês a mês e soma o comprometido", () => {
    const tl = futureInstallmentTimeline(
      [
        { descriptionRaw: "A", amountCents: 10000, installmentN: 1, installmentTotal: 3, postedOn: "2026-09-01" },
        { descriptionRaw: "B", amountCents: 5000, installmentN: 2, installmentTotal: 3, postedOn: "2026-08-01" },
        { descriptionRaw: "C", amountCents: 999, installmentN: 3, installmentTotal: 3, postedOn: "2026-07-01" },
        { descriptionRaw: "D", amountCents: 1, installmentN: null, installmentTotal: null, postedOn: "2026-07-01" },
      ],
      "2026-10",
    );
    expect(tl.months.map((m) => [m.monthKey, m.totalCents])).toEqual([["2026-11", 15000], ["2026-12", 10000]]);
    expect(tl.totalCommittedCents).toBe(25000);
  });
});
