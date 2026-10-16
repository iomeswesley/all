import { describe, expect, it } from "vitest";
import type { AnalyticsTx } from "../src/analytics.ts";
import { CAT } from "../src/categories.ts";
import { computePace, overrunDay, paceFormula, paceLevel, paceStatusLabel, PACE_MIN_DAYS } from "../src/pace.ts";

type T = AnalyticsTx & { manual?: boolean };
const MERCADO = CAT.MERCADO;
const RESTAURANTE = CAT.RESTAURANTE;

const card = (statementMonth: string, amountCents: number, categoryId: number | null = MERCADO, kind: AnalyticsTx["kind"] = "avista"): T => ({
  statementMonth, postedOn: `${statementMonth}-05`, descriptionRaw: "CARTAO", amountCents, categoryId, kind, ownerUserId: null,
});
const pix = (postedOn: string, amountCents: number, categoryId: number | null = MERCADO): T => ({
  statementMonth: postedOn.slice(0, 7), postedOn, descriptionRaw: "PIX X", amountCents, categoryId, kind: "avista", ownerUserId: null, manual: true,
});
const isManual = (t: AnalyticsTx) => Boolean((t as T).manual);

// histórico: cartão de 100.000 (jul) e 80.000 (ago, set) → média 3m = 86.667; Pix médio 30.000
const history: T[] = [
  card("2026-07", 100000), card("2026-08", 80000), card("2026-09", 60000), card("2026-09", 20000, RESTAURANTE),
  pix("2026-07-10", 30000), pix("2026-08-10", 20000), pix("2026-09-10", 40000),
];

describe("ritmo de gasto (pace)", () => {
  it("meio do mês: Pix até hoje × ritmo + cartão médio", () => {
    const txs = [...history, pix("2026-10-03", 10000), pix("2026-10-10", 20000)];
    const p = computePace({ txs, isManual, today: "2026-10-15" });
    expect(p.month).toBe("2026-10");
    expect(p.day).toBe(15);
    expect(p.daysInMonth).toBe(31);
    expect(p.early).toBe(false);
    expect(p.manualSoFarCents).toBe(30000);
    expect(p.manualProjectedCents).toBe(62000); // 30.000 / 15 × 31
    expect(p.cardSource).toBe("media");
    expect(p.cardBasisMonths).toBe(3);
    // mercado: (100.000 + 80.000 + 60.000) / 3 = 80.000; restaurante: 20.000 / 3 = 6.667
    expect(p.cardCents).toBe(86667);
    expect(p.projectedCents).toBe(62000 + 86667);
    expect(p.spentCents).toBe(30000);
    expect(p.formula).toBe("Pix até hoje × ritmo + cartão médio (3m)");
  });

  it("início do mês: não extrapola, usa o maior entre o lançado e o Pix médio", () => {
    const txs = [...history, pix("2026-10-01", 5000)];
    const p = computePace({ txs, isManual, today: "2026-10-01" });
    expect(p.day).toBe(1);
    expect(p.early).toBe(true);
    expect(p.manualProjectedCents).toBe(30000); // média dos manuais, e não 5.000 × 31
    expect(p.formula).toBe("Pix médio + cartão médio (3m)");
    // gasto grande no começo vale mais que a média
    const big = computePace({ txs: [...history, pix("2026-10-02", 90000)], isManual, today: "2026-10-02" });
    expect(big.manualProjectedCents).toBe(90000);
    // a partir do dia PACE_MIN_DAYS o ritmo linear assume
    expect(computePace({ txs, isManual, today: `2026-10-0${PACE_MIN_DAYS}` }).early).toBe(false);
  });

  it("fim do mês: projetado = lançado; datas fora do mês ficam limitadas", () => {
    const txs = [...history, pix("2026-10-20", 31000)];
    const last = computePace({ txs, isManual, today: "2026-10-31" });
    expect(last.day).toBe(31);
    expect(last.manualProjectedCents).toBe(31000);
    const after = computePace({ txs, isManual, today: "2026-11-03", month: "2026-10" });
    expect(after.day).toBe(31);
    expect(after.manualProjectedCents).toBe(31000);
  });

  it("fevereiro: 28 dias (e 29 no bissexto)", () => {
    const p = computePace({ txs: [pix("2027-02-07", 14000)], isManual, today: "2027-02-14" });
    expect(p.daysInMonth).toBe(28);
    expect(p.manualProjectedCents).toBe(28000);
    const leap = computePace({ txs: [pix("2028-02-07", 14000)], isManual, today: "2028-02-14" });
    expect(leap.daysInMonth).toBe(29);
    expect(leap.manualProjectedCents).toBe(29000);
  });

  it("mês sem manuais: só o cartão médio", () => {
    const p = computePace({ txs: history, isManual, today: "2026-10-20" });
    expect(p.manualSoFarCents).toBe(0);
    expect(p.manualProjectedCents).toBe(0);
    expect(p.projectedCents).toBe(86667);
    expect(p.spentCents).toBe(0);
  });

  it("sem histórico de cartão: só o ritmo do Pix", () => {
    const p = computePace({ txs: [pix("2026-10-10", 10000)], isManual, today: "2026-10-10" });
    expect(p.cardSource).toBe("nenhum");
    expect(p.cardCents).toBe(0);
    expect(p.projectedCents).toBe(31000);
    expect(p.formula).toBe("Pix até hoje × ritmo");
  });

  it("fatura do mês já confirmada: usa o valor real e conta como gasto", () => {
    const txs = [...history, card("2026-10", 120000), card("2026-10", -5000), card("2026-10", 99999, MERCADO, "pagamento"), pix("2026-10-10", 10000)];
    const p = computePace({ txs, isManual, today: "2026-10-10" });
    expect(p.cardSource).toBe("fatura");
    expect(p.cardCents).toBe(115000); // estorno abate, pagamento fica fora
    expect(p.spentCents).toBe(125000);
    expect(p.projectedCents).toBe(31000 + 115000);
    expect(p.formula).toBe("Pix até hoje × ritmo + fatura do mês");
    // explícito: sem fatura confirmada, mesmo havendo lançamentos (ex.: cartão de outra conta)
    expect(computePace({ txs, isManual, today: "2026-10-10", cardConfirmed: false }).cardSource).toBe("media");
  });

  it("sem orçamento: categorias sem nível", () => {
    const p = computePace({ txs: [...history, pix("2026-10-10", 10000)], isManual, today: "2026-10-10" });
    expect(p.over).toBe(0);
    expect(p.near).toBe(0);
    expect(p.categories.every((c) => c.level === null && c.limitCents === null && c.overDay === null)).toBe(true);
    expect(p.categories.map((c) => c.categoryId)).toEqual([MERCADO, RESTAURANTE]);
  });

  it("orçamento: dentro, perto e vai estourar em ~dia N", () => {
    // mercado no dia 10: Pix 20.000 → 62.000 no mês + cartão 80.000 = 142.000
    const txs = [...history, pix("2026-10-10", 20000)];
    const at = (limit: number) => computePace({ txs, isManual, today: "2026-10-10", limits: new Map([[MERCADO, limit], [CAT.SAUDE, 10000]]) }).categories;
    const est = at(120000).find((c) => c.categoryId === MERCADO)!;
    expect(est.level).toBe("estoura");
    expect(est.percent).toBe(118);
    // falta 100.000 até 120.000; o resto (122.000) em 21 dias ≈ 5.810/dia → 18 dias → dia 28
    expect(est.overDay).toBe(28);
    expect(paceStatusLabel(est)).toBe("Vai estourar ~dia 28");
    expect(at(170000).find((c) => c.categoryId === MERCADO)!.level).toBe("perto");
    expect(paceStatusLabel(at(300000).find((c) => c.categoryId === MERCADO)!)).toBe("Dentro");
    // categoria com limite e sem gasto entra como "dentro"
    const saude = at(120000).find((c) => c.categoryId === CAT.SAUDE)!;
    expect(saude.projectedCents).toBe(0);
    expect(saude.level).toBe("dentro");
    // ordem: estoura antes de dentro
    expect(at(120000)[0]!.categoryId).toBe(MERCADO);
  });

  it("já estourou com o que aconteceu", () => {
    const p = computePace({ txs: [pix("2026-10-10", 50000)], isManual, today: "2026-10-12", limits: new Map([[MERCADO, 40000]]) });
    const c = p.categories[0]!;
    expect(c.alreadyOver).toBe(true);
    expect(c.overDay).toBeNull();
    expect(paceStatusLabel(c)).toBe("Estourou");
    expect(p.over).toBe(1);
  });

  it("helpers", () => {
    expect(paceLevel(80, 100)).toBe("perto");
    expect(paceLevel(79, 100)).toBe("dentro");
    expect(paceLevel(100, 100)).toBe("estoura");
    expect(overrunDay(0, 200, 100, 10, 30)).toBe(20);
    expect(overrunDay(0, 90, 100, 10, 30)).toBeNull();
    expect(overrunDay(0, 200, 100, 30, 30)).toBeNull();
    expect(paceFormula({ early: false, cardSource: "media", cardBasisMonths: 1 })).toBe("Pix até hoje × ritmo + cartão médio");
  });
});
