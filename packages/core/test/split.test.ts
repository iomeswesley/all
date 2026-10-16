import { describe, expect, it } from "vitest";
import {
  allocateCents,
  computeSplit,
  debtSentence,
  entryOwed,
  incomePct,
  ruleForMonth,
  ruleShares,
  type SplitEntry,
  type SplitRule,
  type SplitSettlement,
} from "../src/split.ts";
import { formatBRL } from "../src/money.ts";

const ANA = "ana";
const BIA = "bia";
const USERS = [ANA, BIA] as const;

let seq = 0;
const entry = (e: Partial<SplitEntry> & Pick<SplitEntry, "amountCents">): SplitEntry => ({
  id: `t${++seq}`, month: "2026-10", postedOn: "2026-10-05", description: "MERCADO", ownerUserId: null, payerUserId: ANA, override: null, ...e,
});
const rule = (month: string, mode: SplitRule["mode"], customUserId: string | null = null, customPct: number | null = null): SplitRule => ({ month, mode, customUserId, customPct });

/** Gerador pseudoaleatório determinístico (mulberry32) para os testes de propriedade. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

describe("allocateCents — arredondamento exato ao centavo", () => {
  it("casos conhecidos", () => {
    expect(allocateCents(100, [50, 50])).toEqual([50, 50]);
    expect(allocateCents(101, [50, 50])).toEqual([51, 50]); // empate: o primeiro leva o centavo
    expect(allocateCents(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocateCents(999, [70, 30])).toEqual([699, 300]); // 699,3 / 299,7 → maior resto leva
    expect(allocateCents(1, [0, 100])).toEqual([0, 1]);
    expect(allocateCents(-101, [50, 50])).toEqual([-51, -50]); // estorno espelha a compra
    expect(allocateCents(0, [3, 7])).toEqual([0, 0]);
  });

  it("recusa entradas inválidas", () => {
    expect(() => allocateCents(10.5, [1, 1])).toThrow();
    expect(() => allocateCents(10, [])).toThrow();
    expect(() => allocateCents(10, [0, 0])).toThrow();
    expect(() => allocateCents(10, [-1, 2])).toThrow();
    expect(() => allocateCents(10, [0.5, 2])).toThrow();
  });

  it("propriedades: soma exata, cada parte a menos de 1 centavo da conta exata, sinal e monotonicidade", () => {
    const r = rng(42);
    for (let i = 0; i < 5000; i++) {
      const n = int(r, 1, 5);
      const weights = Array.from({ length: n }, () => int(r, 0, 100));
      if (!weights.some((w) => w > 0)) weights[0] = 1;
      const total = int(r, -5_000_000, 50_000_000);
      const parts = allocateCents(total, weights);
      const sumW = weights.reduce((a, b) => a + b, 0);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      parts.forEach((p, k) => {
        expect(Number.isInteger(p)).toBe(true);
        expect(Math.abs(p - (total * weights[k]!) / sumW)).toBeLessThan(1);
        if (weights[k] === 0) expect(p).toBe(0);
        if (total >= 0) expect(p).toBeGreaterThanOrEqual(0);
        else expect(p).toBeLessThanOrEqual(0);
      });
      // peso maior nunca recebe menos
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) if (weights[x]! > weights[y]! && total >= 0) expect(parts[x]!).toBeGreaterThanOrEqual(parts[y]!);
    }
  });

  it("valores muito grandes continuam exatos (sem ponto flutuante)", () => {
    const total = Number.MAX_SAFE_INTEGER - 7;
    const parts = allocateCents(total, [33, 67]);
    expect(parts[0]! + parts[1]!).toBe(total);
  });
});

describe("regra do casal", () => {
  it("percentual pela renda: inteiro, meio para cima, soma 100", () => {
    expect(incomePct(600000, 300000)).toBe(67);
    expect(incomePct(300000, 600000)).toBe(33);
    expect(incomePct(1, 7)).toBe(13); // 12,5 → 13
    expect(incomePct(0, 0)).toBeNull();
    expect(incomePct(500000, 0)).toBe(100);
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const a = int(r, 0, 10_000_000), b = int(r, 1, 10_000_000);
      expect(incomePct(a, b)! + incomePct(b, a)!).toBeGreaterThanOrEqual(99); // arredondamentos independentes
      expect(Math.abs(incomePct(a, b)! - (100 * a) / (a + b))).toBeLessThanOrEqual(0.5);
    }
  });

  it("vale a última regra gravada até o mês; sem regra, 50/50", () => {
    const rules = [rule("2026-08", "custom", ANA, 70), rule("2026-11", "equal")];
    expect(ruleForMonth(rules, "2026-07").mode).toBe("equal");
    expect(ruleForMonth(rules, "2026-10")).toMatchObject({ mode: "custom", customPct: 70 });
    expect(ruleForMonth(rules, "2027-01").mode).toBe("equal");
  });

  it("pesos por modo e queda para 50/50 quando falta dado", () => {
    expect(ruleShares(rule("x", "custom", BIA, 30), USERS, null)).toEqual({ shares: { ana: 70, bia: 30 }, fallback: false });
    expect(ruleShares(rule("x", "income"), USERS, { ana: 67, bia: 33 })).toEqual({ shares: { ana: 67, bia: 33 }, fallback: false });
    expect(ruleShares(rule("x", "income"), USERS, null)).toEqual({ shares: { ana: 50, bia: 50 }, fallback: true });
    expect(ruleShares(rule("x", "custom", "carlos", 80), USERS, null).fallback).toBe(true); // pessoa que saiu
  });

  it("exceção por lançamento vence a regra; dono deve 100%", () => {
    const shares = { ana: 50, bia: 50 };
    expect(entryOwed(entry({ amountCents: 1001 }), USERS, shares)).toEqual({ ana: 501, bia: 500 });
    expect(entryOwed(entry({ amountCents: 1000, override: { shareUserId: BIA, sharePct: 100, paidByUserId: null } }), USERS, shares)).toEqual({ ana: 0, bia: 1000 });
    expect(entryOwed(entry({ amountCents: 1000, override: { shareUserId: ANA, sharePct: 70, paidByUserId: null } }), USERS, shares)).toEqual({ ana: 700, bia: 300 });
    expect(entryOwed(entry({ amountCents: 1000, ownerUserId: BIA }), USERS, shares)).toEqual({ ana: 0, bia: 1000 });
  });
});

describe("acerto de contas", () => {
  it("exemplo: 50/50, Ana pagou o mercado, Bia a farmácia → Bia deve a Ana", () => {
    const res = computeSplit({
      users: USERS,
      entries: [entry({ amountCents: 40000, payerUserId: ANA }), entry({ amountCents: 10000, payerUserId: BIA })],
      rules: [], incomeShares: null, settlements: [],
    });
    const m = res.months[0]!;
    expect(m).toMatchObject({ month: "2026-10", totalCents: 50000, count: 2, paid: { ana: 40000, bia: 10000 }, owed: { ana: 25000, bia: 25000 }, net: { ana: 15000, bia: -15000 } });
    expect(res.debt).toEqual({ fromUserId: BIA, toUserId: ANA, amountCents: 15000 });
    expect(debtSentence(res.debt, (u, obj) => (u === ANA ? (obj ? "você" : "Você") : "Bia"), formatBRL)).toBe("Bia deve R$ 150,00 a você");
  });

  it("proporcional à renda (R$ 6 mil × R$ 3 mil, contas de R$ 4,5 mil)", () => {
    const res = computeSplit({
      users: USERS,
      entries: [entry({ amountCents: 450000, payerUserId: ANA })],
      rules: [rule("2026-01", "income")], incomeShares: { ana: incomePct(600000, 300000)!, bia: incomePct(300000, 600000)! }, settlements: [],
    });
    expect(res.months[0]!.owed).toEqual({ ana: 301500, bia: 148500 });
    expect(res.debt).toEqual({ fromUserId: BIA, toUserId: ANA, amountCents: 148500 });
  });

  it("saldo acumula entre meses e o acerto registrado abate/zera", () => {
    const entries = [
      entry({ month: "2026-09", amountCents: 20000, payerUserId: ANA }),
      entry({ month: "2026-10", amountCents: 30000, payerUserId: ANA }),
    ];
    const settlements: SplitSettlement[] = [{ id: "s1", fromUserId: BIA, toUserId: ANA, amountCents: 10000, settledOn: "2026-10-20" }];
    const res = computeSplit({ users: USERS, entries, rules: [], incomeShares: null, settlements });
    expect(res.months.map((m) => m.balance.bia)).toEqual([-10000, -15000]);
    expect(res.debt).toEqual({ fromUserId: BIA, toUserId: ANA, amountCents: 15000 });
    const zerado = computeSplit({ users: USERS, entries, rules: [], incomeShares: null, settlements: [...settlements, { id: "s2", fromUserId: BIA, toUserId: ANA, amountCents: 15000, settledOn: "2026-11-02" }] });
    expect(zerado.debt).toBeNull();
    expect(zerado.months.at(-1)).toMatchObject({ month: "2026-11", totalCents: 0, settled: { bia: 15000, ana: -15000 } });
  });

  it("estorno desfaz a compra; dono pagando o próprio gasto não aparece; sem pagador fica de fora", () => {
    const res = computeSplit({
      users: USERS,
      entries: [
        entry({ amountCents: 10001, payerUserId: ANA }),
        entry({ amountCents: -10001, payerUserId: ANA }),
        entry({ amountCents: 5000, ownerUserId: ANA, payerUserId: ANA }),
        entry({ amountCents: 8000, ownerUserId: BIA, payerUserId: ANA }),
        entry({ amountCents: 3000, payerUserId: null }),
        entry({ amountCents: 3000, payerUserId: "carlos" }),
        entry({ amountCents: 4000, ownerUserId: BIA, payerUserId: null }), // com dono e sem pagador: presume o dono
      ],
      rules: [], incomeShares: null, settlements: [],
    });
    expect(res.months[0]!.count).toBe(3);
    expect(res.unknownPayer).toHaveLength(2);
    expect(res.debt).toEqual({ fromUserId: BIA, toUserId: ANA, amountCents: 8000 });
  });

  it("'quem pagou' informado na exceção vence o automático", () => {
    const res = computeSplit({
      users: USERS,
      entries: [entry({ amountCents: 6000, payerUserId: null, override: { shareUserId: null, sharePct: null, paidByUserId: BIA } })],
      rules: [], incomeShares: null, settlements: [],
    });
    expect(res.unknownPayer).toEqual([]);
    expect(res.debt).toEqual({ fromUserId: ANA, toUserId: BIA, amountCents: 3000 });
  });

  it("regra muda no meio do caminho só a partir do mês gravado", () => {
    const res = computeSplit({
      users: USERS,
      entries: [entry({ month: "2026-09", amountCents: 10000 }), entry({ month: "2026-10", amountCents: 10000 })],
      rules: [rule("2026-10", "custom", ANA, 80)], incomeShares: null, settlements: [],
    });
    expect(res.months.map((m) => m.owed.ana)).toEqual([5000, 8000]);
  });

  it("propriedades: cada mês fecha (pagou = deveria = total) e os saldos somam zero", () => {
    const r = rng(2026);
    for (let round = 0; round < 300; round++) {
      const entries: SplitEntry[] = Array.from({ length: int(r, 0, 40) }, () => {
        const pick = r();
        return entry({
          month: `2026-${String(int(r, 1, 12)).padStart(2, "0")}`,
          amountCents: int(r, -20000, 200000),
          payerUserId: r() < 0.5 ? ANA : BIA,
          ownerUserId: pick < 0.15 ? ANA : pick < 0.3 ? BIA : null,
          override: r() < 0.2 ? { shareUserId: r() < 0.5 ? ANA : BIA, sharePct: int(r, 0, 100), paidByUserId: null } : null,
        });
      });
      const settlements: SplitSettlement[] = Array.from({ length: int(r, 0, 3) }, (_, k) => ({
        id: `s${k}`, fromUserId: r() < 0.5 ? ANA : BIA, toUserId: null, amountCents: int(r, 1, 50000), settledOn: `2026-${String(int(r, 1, 12)).padStart(2, "0")}-10`,
      })).map((s) => ({ ...s, toUserId: s.fromUserId === ANA ? BIA : ANA }));
      const rules = [rule("2026-03", "custom", BIA, int(r, 0, 100)), rule("2026-07", "income"), rule("2026-10", "equal")];
      const pa = int(r, 0, 100);
      const res = computeSplit({ users: USERS, entries, rules, incomeShares: { ana: pa, bia: 100 - pa }, settlements });
      for (const m of res.months) {
        expect(m.paid.ana! + m.paid.bia!).toBe(m.totalCents);
        expect(m.owed.ana! + m.owed.bia!).toBe(m.totalCents);
        expect(m.net.ana! + m.net.bia!).toBe(0);
        expect(m.balance.ana! + m.balance.bia!).toBe(0);
      }
      expect(res.balance.ana! + res.balance.bia!).toBe(0);
      const d = res.debt;
      expect(d === null ? 0 : d.amountCents).toBe(Math.abs(res.balance.ana!));
    }
  });
});
