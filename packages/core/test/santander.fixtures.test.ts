import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDraft } from "../src/draft.ts";
import { futureInstallmentTimeline, statementMonthKey } from "../src/installments.ts";
import { parseSantanderStatement } from "../src/parsers/santander/index.ts";
import type { PdfTextItem } from "../src/parsers/types.ts";
import { reconcileParsed } from "../src/reconcile.ts";

const dir = path.resolve(import.meta.dirname, "../../../fixtures/santander");
const months = fs.readdirSync(dir).filter((f) => f.endsWith(".items.json")).map((f) => f.replace(".items.json", "")).sort();

const load = (m: string) => JSON.parse(fs.readFileSync(path.join(dir, `${m}.items.json`), "utf8")) as PdfTextItem[];
const expected = (m: string) => JSON.parse(fs.readFileSync(path.join(dir, "expected", `${m}.json`), "utf8"));

describe("fixtures Santander anonimizadas", () => {
  it("há 7 faturas de exemplo", () => expect(months).toHaveLength(7));

  describe.each(months)("fatura %s", (m) => {
    const parsed = parseSantanderStatement(load(m));
    const exp = expected(m);

    it("totais declarados batem com o texto do PDF (extração independente)", () => {
      expect(parsed.totalDueCents).toBe(exp.totalDueCents);
      expect(parsed.dueDate).toBe(exp.dueDate);
      expect(parsed.closingDate).toBe(exp.closingDate);
      expect(parsed.summary).toMatchObject({
        previousBalanceCents: exp.previousBalanceCents,
        domesticExpensesCents: exp.domesticExpensesCents,
        foreignExpensesCents: exp.foreignExpensesCents,
        foreignExpensesUsdCents: exp.foreignExpensesUsdCents,
        paymentsCents: exp.paymentsCents,
        creditsCents: exp.creditsCents,
        balanceCents: exp.balanceCents,
      });
      expect(parsed.futureObligationsCents).toBe(exp.futureObligationsCents);
      expect(parsed.warnings).toEqual([]);
    });

    it("SOMA = TOTAL: lançamentos + saldo anterior − pagamentos − créditos = total a pagar", () => {
      const r = reconcileParsed(parsed);
      const byId = Object.fromEntries(r.checks.map((c) => [c.id, c]));
      expect(byId.total!.diffCents).toBe(0);
      expect(byId.expenses!.diffCents).toBe(0);
      expect(byId.payments!.diffCents).toBe(0);
      expect(byId.credits!.diffCents).toBe(0);
      expect(byId.usd!.diffCents).toBe(0);
      expect(r.computedTotalCents).toBe(exp.totalDueCents);
      expect(r.totalDiffCents).toBe(0);
    });

    it("PARCELAS FUTURAS = OBRIGAÇÕES FUTURAS (exato, ou só arredondamento de centavos)", () => {
      const r = reconcileParsed(parsed);
      const check = r.checks.find((c) => c.id === "future_obligations")!;
      expect(["ok", "rounding"]).toContain(check.status);
      expect(Math.abs(check.diffCents)).toBeLessThanOrEqual(40);
      expect(r.status).not.toBe("fail");
      expect(r.canAutoConfirm).toBe(true);
    });

    it("datas plausíveis e tipos coerentes", () => {
      for (const t of parsed.transactions) {
        expect(t.postedOn <= parsed.closingDate, `${t.descriptionRaw} ${t.postedOn}`).toBe(true);
        if (t.kind !== "pagamento") expect(t.postedOn >= "2024-01-01").toBe(true);
        if (t.kind === "parcela") {
          expect(t.installmentN).toBeGreaterThanOrEqual(1);
          expect(t.installmentTotal).toBeGreaterThanOrEqual(t.installmentN!);
        } else {
          expect(t.installmentN).toBeNull();
        }
        if (t.amountUsdCents !== null) expect(t.fxRate, t.descriptionRaw).toBeGreaterThan(3);
        if (t.parentIndex !== null) {
          expect(t.kind).toBe("encargo");
          expect(parsed.transactions[t.parentIndex]!.amountUsdCents).not.toBeNull();
        }
      }
      expect(parsed.cards.map((c) => c.last4).sort()).toEqual(["1111", "2222"]);
    });

    it("rascunho: hashes únicos e estáveis, valores só em centavos inteiros", () => {
      const a = buildDraft(parsed, { accountId: "acc" });
      const b = buildDraft(parseSantanderStatement(load(m)), { accountId: "acc" });
      expect(a.transactions.map((t) => t.dedupeHash)).toEqual(b.transactions.map((t) => t.dedupeHash));
      expect(new Set(a.transactions.map((t) => t.dedupeHash)).size).toBe(a.transactions.length);
      for (const t of a.transactions) expect(Number.isInteger(t.amountCents)).toBe(true);
      expect(a.statement.statementMonth).toBe(m);
      expect(a.statement.computedTotalCents).toBe(exp.totalDueCents);
    });
  });

  it("2026-09: parcelas futuras batem EXATAMENTE com R$ 2.350,44 e a linha do tempo soma o mesmo", () => {
    const parsed = parseSantanderStatement(load("2026-09"));
    const r = reconcileParsed(parsed);
    expect(r.checks.find((c) => c.id === "future_obligations")).toMatchObject({ status: "ok", diffCents: 0 });
    const draft = buildDraft(parsed, { accountId: "acc" });
    const tl = futureInstallmentTimeline(draft.transactions.filter((t) => t.kind === "parcela"), statementMonthKey(parsed.dueDate));
    expect(tl.totalCommittedCents).toBe(235044);
    expect(tl.months[0]!.monthKey).toBe("2026-10");
    // o "piso" do mês seguinte é a soma das parcelas que ainda não terminaram
    const next = parsed.transactions.filter((t) => t.kind === "parcela" && t.installmentN! < t.installmentTotal!).reduce((a, t) => a + t.amountCents, 0);
    expect(tl.months[0]!.totalCents).toBe(next);
    // e vai decrescendo até zerar
    const totals = tl.months.map((x) => x.totalCents);
    expect([...totals].sort((x, y) => y - x)).toEqual(totals);
  });

  it("parcelas avançam 1 por mês entre faturas consecutivas", () => {
    const seen = new Map<string, Map<string, number>>();
    for (const m of months) {
      const parsed = parseSantanderStatement(load(m));
      for (const t of parsed.transactions.filter((t) => t.kind === "parcela")) {
        const key = `${t.postedOn}|${t.descriptionRaw}|${t.installmentTotal}`;
        (seen.get(key) ?? seen.set(key, new Map()).get(key)!).set(m, t.installmentN!);
      }
    }
    let multi = 0;
    for (const [key, byMonth] of seen) {
      const entries = [...byMonth.entries()].sort();
      if (entries.length > 1) multi++;
      for (let i = 1; i < entries.length; i++) expect(entries[i]![1] - entries[i - 1]![1], key).toBe(1);
    }
    expect(multi).toBeGreaterThan(10);
  });

  it("nenhum hash de deduplicação se repete entre as 7 faturas da mesma conta", () => {
    const all = months.flatMap((m) => buildDraft(parseSantanderStatement(load(m)), { accountId: "acc" }).transactions.map((t) => t.dedupeHash));
    expect(new Set(all).size).toBe(all.length);
  });

  it("compra em dólar: câmbio e IOF vinculados (ago/26)", () => {
    const draft = buildDraft(parseSantanderStatement(load("2026-08")), { accountId: "acc" });
    const usd = draft.transactions.filter((t) => t.amountUsdCents !== null);
    expect(usd.length).toBeGreaterThanOrEqual(3);
    expect(usd.every((t) => t.fxRate !== null)).toBe(true);
    const iof = draft.transactions.filter((t) => t.descriptionRaw === "IOF DESPESA NO EXTERIOR");
    expect(iof).toHaveLength(3);
    expect(iof.every((t) => t.kind === "encargo" && t.categoryId === 11)).toBe(true);
    expect(iof[0]!.descriptionClean).toMatch(/^IOF · Anthropic/);
  });

  it("anuidade: isenção de 100% lida da primeira página", () => {
    const parsed = parseSantanderStatement(load("2026-09"));
    expect(parsed.annuity).toEqual([{ cardLast4: "1111", installmentCents: 8750, discountPercent: 100, reason: expect.any(String), payCents: 0 }]);
    expect(parsed.product).toBe("SANTANDER UNIQUE VISA");
    expect(parsed.bestPurchaseDate).toBe("2026-09-30");
  });

  it("uma soma alterada é detectada (a conferência não aceita erro silencioso)", () => {
    const parsed = parseSantanderStatement(load("2026-09"));
    const tampered = { ...parsed, transactions: parsed.transactions.map((t, i) => (i === 10 ? { ...t, amountCents: t.amountCents + 1 } : t)) };
    const r = reconcileParsed(tampered);
    expect(r.status).toBe("fail");
    expect(r.canAutoConfirm).toBe(false);
    expect(r.totalDiffCents).toBe(1);
  });
});
