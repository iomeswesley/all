import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAT } from "../src/categories.ts";
import { buildCheckin } from "../src/checkin.ts";
import { buildDraft } from "../src/draft.ts";
import { parseSantanderStatement } from "../src/parsers/santander/index.ts";
import { detectPriceChanges, type PriceTx } from "../src/price-change.ts";

const tx = (month: string, amountCents: number, o: Partial<PriceTx> = {}): PriceTx => ({
  statementMonth: month, postedOn: `${month}-05`, descriptionRaw: "NETFLIX.COM", amountCents,
  categoryId: CAT.ASSINATURAS, kind: "avista", ...o,
});
const series = (desc: string, values: [string, number][], o: Partial<PriceTx> = {}) => values.map(([m, v]) => tx(m, v, { descriptionRaw: desc, ...o }));

describe("alerta de valor diferente em recorrências", () => {
  it("aumento: de R$ 39,90 para R$ 44,90 → +R$ 5/mês, +R$ 60/ano", () => {
    const r = detectPriceChanges(series("NETFLIX.COM", [["2026-07", 3990], ["2026-08", 3990], ["2026-09", 4490]]), "2026-09");
    expect(r.increases).toHaveLength(1);
    expect(r.increases[0]).toMatchObject({ status: "aumentou", fromCents: 3990, toCents: 4490, diffCents: 500, annualDiffCents: 6000, percent: 12.5, prevMonth: "2026-08", month: "2026-09", inUsd: false });
    expect(r.increaseMonthlyCents).toBe(500);
    expect(r.increaseAnnualCents).toBe(6000);
  });

  it("aumento só no mês em que aconteceu (depois o novo preço vira o normal)", () => {
    const txs = series("NETFLIX.COM", [["2026-06", 3990], ["2026-07", 3990], ["2026-08", 4490], ["2026-09", 4490]]);
    expect(detectPriceChanges(txs, "2026-09").items).toHaveLength(0);
    expect(detectPriceChanges(txs, "2026-08").increases).toHaveLength(1);
  });

  it("limiar: ≥ 5% E ≥ R$ 1, sem erro de arredondamento", () => {
    const at = (from: number, to: number, desc = "SPOTIFY") => detectPriceChanges(series(desc, [["2026-08", from], ["2026-09", to]]), "2026-09").items[0]?.status ?? "igual";
    expect(at(10000, 10500)).toBe("aumentou"); // exatamente 5%
    expect(at(10000, 10499)).toBe("igual"); // 4,99%
    expect(at(3990, 4190)).toBe("aumentou"); // 5,01%
    expect(at(1000, 1099)).toBe("igual"); // 9,9% mas < R$ 1
    expect(at(1000, 1100)).toBe("aumentou"); // 10% e R$ 1
    expect(at(10500, 10000)).toBe("igual"); // queda de 4,76%
    expect(at(4490, 3990)).toBe("caiu");
  });

  it("percentual com 1 casa e valores sempre em centavos inteiros", () => {
    const r = detectPriceChanges(series("YOUTUBE", [["2026-08", 2390], ["2026-09", 2690]]), "2026-09");
    const c = r.items[0]!;
    expect(c.percent).toBe(12.6); // 300/2390 = 12,55…%
    expect(Number.isInteger(c.diffCents) && Number.isInteger(c.annualDiffCents)).toBe(true);
  });

  it("caiu entra na lista mas não soma nos aumentos", () => {
    const r = detectPriceChanges(series("NETFLIX.COM", [["2026-07", 5590], ["2026-08", 5590], ["2026-09", 4490]]), "2026-09");
    expect(r.items[0]).toMatchObject({ status: "caiu", diffCents: -1100, annualDiffCents: -13200 });
    expect(r.increases).toHaveLength(0);
    expect(r.increaseAnnualCents).toBe(0);
  });

  it("nova: assinatura que aparece pela 1ª vez no mês", () => {
    const r = detectPriceChanges([tx("2026-09", 2990, { descriptionRaw: "MAX STREAMING" })], "2026-09");
    expect(r.items[0]).toMatchObject({ status: "nova", fromCents: null, toCents: 2990, annualDiffCents: 35880 });
    // compra única fora de Assinaturas não é "nova"
    expect(detectPriceChanges([tx("2026-09", 2990, { descriptionRaw: "LOJA X", categoryId: CAT.COMPRAS })], "2026-09").items).toHaveLength(0);
  });

  it("sumiu: não veio no último mês esperado; encerrada há mais tempo é ignorada", () => {
    const txs = series("DISNEY PLUS", [["2026-06", 3390], ["2026-07", 3390], ["2026-08", 3390]]);
    expect(detectPriceChanges(txs, "2026-09").items[0]).toMatchObject({ status: "sumiu", fromCents: 3390, toCents: null, diffCents: -3390, annualDiffCents: -40680 });
    expect(detectPriceChanges(txs, "2026-10").items).toHaveLength(0);
  });

  it("meses faltando: compara com a última cobrança anterior e conta os meses pulados", () => {
    const r = detectPriceChanges(series("NETFLIX.COM", [["2026-05", 3990], ["2026-06", 3990], ["2026-09", 4490]]), "2026-09");
    expect(r.increases[0]).toMatchObject({ prevMonth: "2026-06", fromCents: 3990, toCents: 4490, skippedMonths: 2 });
    const same = detectPriceChanges(series("NETFLIX.COM", [["2026-05", 3990], ["2026-07", 3990], ["2026-09", 3990]]), "2026-09");
    expect(same.items).toHaveLength(0);
  });

  it("ignora meses depois do mês de referência", () => {
    const txs = series("NETFLIX.COM", [["2026-07", 3990], ["2026-08", 3990], ["2026-09", 4490]]);
    expect(detectPriceChanges(txs, "2026-08").items).toHaveLength(0);
  });

  it("não confunde compras soltas ou frequentes com recorrência", () => {
    // padaria: várias por mês
    const padaria = ["2026-08", "2026-09"].flatMap((m) => [1, 2, 3].map((d) => tx(m, 1500 + d * 100, { descriptionRaw: "PADARIA CENTRAL", categoryId: CAT.RESTAURANTE, postedOn: `${m}-0${d}` })));
    // conta com só 2 meses e valores bem diferentes (fora de Assinaturas): pouco histórico
    const rest = series("DIARISTA ANA", [["2026-08", 8000], ["2026-09", 11000]], { categoryId: CAT.SERVICOS });
    // posto com valor parecido todo mês: não é conta
    const posto = series("POSTO 020", [["2026-06", 23700], ["2026-07", 23700], ["2026-08", 23700], ["2026-09", 25600]], { categoryId: CAT.TRANSPORTE });
    // salto grande demais: outra coisa
    const salto = series("APPLE.COM/BILL", [["2026-08", 990], ["2026-09", 4990]]);
    expect(detectPriceChanges([...padaria, ...rest, ...posto, ...salto], "2026-09").items).toHaveLength(0);
  });

  it("fora de Assinaturas: aceita conta acima do habitual com histórico estável", () => {
    const r = detectPriceChanges(series("SEGURO AUTO", [["2026-06", 18000], ["2026-07", 18000], ["2026-08", 18000], ["2026-09", 21000]], { categoryId: CAT.SERVICOS }), "2026-09");
    expect(r.increases[0]).toMatchObject({ fromCents: 18000, toCents: 21000, annualDiffCents: 36000 });
  });

  it("duas cobranças no mês: compara a primeira (duplicidade é outro alerta)", () => {
    const txs = [...series("NETFLIX.COM", [["2026-08", 3990], ["2026-09", 3990]]), tx("2026-09", 3990, { postedOn: "2026-09-20" })];
    expect(detectPriceChanges(txs, "2026-09").items).toHaveLength(0);
  });

  describe("cobranças em dólar", () => {
    const usd = (month: string, usdCents: number, fx: number, o: Partial<PriceTx> = {}) =>
      tx(month, Math.round(usdCents * fx), { descriptionRaw: "OPENAI *CHATGPT SUBSCR", amountUsdCents: usdCents, fxRate: fx, cardLast4: "1234", ...o });
    const iof = (parent: PriceTx) => tx(parent.statementMonth, Math.round(parent.amountCents * 0.035), { descriptionRaw: "IOF DESPESA NO EXTERIOR", kind: "encargo", categoryId: null, postedOn: parent.postedOn, cardLast4: "1234" });

    it("US$ igual e R$ maior → câmbio, não aumento", () => {
      const r = detectPriceChanges([usd("2026-08", 2000, 5.0), usd("2026-09", 2000, 5.6)], "2026-09");
      expect(r.items[0]).toMatchObject({ status: "cambio", fromCents: 10000, toCents: 11200, diffCents: 1200, inUsd: true, fromUsdCents: 2000, toUsdCents: 2000, priceEffectCents: 0, fxEffectCents: 1200 });
      expect(r.increases).toHaveLength(0);
    });

    it("US$ subiu → aumento, separando preço e câmbio (com IOF no custo)", () => {
      const a = usd("2026-08", 2000, 5.0);
      const b = usd("2026-09", 2500, 5.2);
      const r = detectPriceChanges([a, iof(a), b, iof(b)], "2026-09");
      const c = r.increases[0]!;
      expect(c.fromCents).toBe(10000 + 350);
      expect(c.toCents).toBe(13000 + 455);
      expect(c.diffCents).toBe(3105);
      // preço: US$ 5 × (R$ 134,55 / US$ 25) = R$ 26,91; resto é câmbio
      expect(c.priceEffectCents).toBe(2691);
      expect(c.fxEffectCents).toBe(c.diffCents - c.priceEffectCents!);
      expect(c.annualDiffCents).toBe(3105 * 12);
    });

    it("IOF não vira recorrência própria e câmbio com IOF continua câmbio", () => {
      const a = usd("2026-08", 2000, 5.0);
      const b = usd("2026-09", 2000, 5.5);
      const r = detectPriceChanges([a, iof(a), b, iof(b)], "2026-09");
      expect(r.items).toHaveLength(1);
      expect(r.items[0]).toMatchObject({ status: "cambio", fromCents: 10350, toCents: 11385 });
    });

    it("US$ caiu e câmbio subiu mais → câmbio (sem sinal de aumento real)", () => {
      const r = detectPriceChanges([usd("2026-08", 2000, 5.0), usd("2026-09", 1900, 6.0)], "2026-09");
      expect(r.items[0]?.status).toBe("cambio");
    });

    it("variação pequena em US$ (< 5%) com R$ bem maior → câmbio", () => {
      const r = detectPriceChanges([usd("2026-08", 2000, 5.0), usd("2026-09", 2050, 5.6)], "2026-09");
      expect(r.items[0]?.status).toBe("cambio");
    });
  });

  it("faturas reais: não acusa aumento onde o US$ não mudou", () => {
    const dir = path.resolve(import.meta.dirname, "../../../fixtures/santander");
    const months = fs.readdirSync(dir).filter((f) => f.endsWith(".items.json")).map((f) => f.slice(0, 7)).sort();
    const all = months.flatMap((m) => buildDraft(parseSantanderStatement(JSON.parse(fs.readFileSync(path.join(dir, `${m}.items.json`), "utf8"))), { accountId: "a" }).transactions.map((t) => ({ ...t, statementMonth: m })));
    for (const m of months) {
      const r = detectPriceChanges(all, m);
      for (const c of r.increases) {
        if (c.inUsd) expect(c.toUsdCents! * 100).toBeGreaterThanOrEqual(c.fromUsdCents! * 105);
        expect(c.diffCents).toBeGreaterThanOrEqual(100);
      }
      expect(r.increaseAnnualCents).toBe(r.increaseMonthlyCents * 12);
    }
  });

  it("check-in recomenda revisar assinatura que aumentou", () => {
    const txs = series("NETFLIX.COM", [["2026-07", 3990], ["2026-08", 3990], ["2026-09", 4490]]).map((t) => ({ ...t, ownerUserId: null }));
    const c = buildCheckin({ month: "2026-09", txs });
    const rec = c.recommendations.find((r) => r.kind === "preco");
    expect(rec).toMatchObject({ savingsCentsPerMonth: 500, estimate: false });
    expect(rec!.detail).toMatch(/R\$ 39,90.*R\$ 44,90/);
  });
});
