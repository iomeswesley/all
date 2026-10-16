// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { matchIof, type UsdTx } from "./cardmonitor.ts";
import { CAT } from "./categories.ts";
import { addMonthsToKey } from "./dates.ts";
import { decodeDescription, merchantKey } from "./normalize.ts";
import type { RecurringTx } from "./recurring.ts";

/**
 * Alerta de valor diferente em recorrências/assinaturas (aumento de preço, conta acima do habitual).
 * Compara a última cobrança com a anterior (a do último mês em que houve cobrança, mesmo com meses
 * faltando no meio). Em serviços cobrados em dólar o IOF casado entra no custo em R$, e se o valor
 * em US$ não mudou a diferença é rotulada como "câmbio", não como aumento.
 */

export type PriceChangeStatus = "aumentou" | "caiu" | "cambio" | "nova" | "sumiu" | "igual";

export interface PriceTx extends RecurringTx {
  cardLast4?: string | null;
  fxRate?: number | null;
}

export interface PriceChange {
  key: string;
  label: string;
  categoryId: number | null;
  status: PriceChangeStatus;
  /** meses (competência) com cobrança, até o mês de referência */
  months: string[];
  /** mês da cobrança comparada (a última) e da anterior */
  month: string;
  prevMonth: string | null;
  /** custo em R$ (com IOF quando houver) antes e agora; null quando não se aplica */
  fromCents: number | null;
  toCents: number | null;
  /** variação por mês (R$) e por ano (×12) */
  diffCents: number;
  annualDiffCents: number;
  /** variação em %, 1 casa */
  percent: number | null;
  /** meses sem cobrança entre a anterior e a última */
  skippedMonths: number;
  inUsd: boolean;
  fromUsdCents: number | null;
  toUsdCents: number | null;
  /** parte da variação vinda do preço em US$ (ao câmbio atual) e do câmbio; só em US$ */
  priceEffectCents: number | null;
  fxEffectCents: number | null;
}

export interface PriceChangeReport {
  month: string;
  /** só o que mudou (sem "igual"): aumentos primeiro, depois por impacto anual */
  items: PriceChange[];
  increases: PriceChange[];
  increaseMonthlyCents: number;
  increaseAnnualCents: number;
}

/** Limiar de mudança: ≥ 5% e ≥ R$ 1. */
export const PRICE_CHANGE_MIN_PERCENT = 5;
export const PRICE_CHANGE_MIN_CENTS = 100;
/** variação máxima aceita entre meses para ainda ser "a mesma" cobrança */
const MAX_JUMP = 1.6;
/** variação normal de uma recorrência estável */
const STABLE = 1.1;
const BILL_CATEGORIES = new Set<number>([CAT.CASA, CAT.SERVICOS, CAT.SAUDE, CAT.EDUCACAO]);

const ratio = (a: number, b: number) => (a > 0 && b > 0 ? Math.max(a, b) / Math.min(a, b) : Infinity);
/** |diff| ≥ 5% de `from` e ≥ `minAbs` (aritmética inteira, sem erro de ponto flutuante) */
const passes = (from: number, diff: number, minAbs: number) => Math.abs(diff) >= minAbs && Math.abs(diff) * 100 >= from * PRICE_CHANGE_MIN_PERCENT;
const pct = (from: number, diff: number) => (from > 0 ? Math.round((diff / from) * 1000) / 10 : null);

interface Charge { month: string; tx: PriceTx; costCents: number; usdCents: number | null }

export function detectPriceChanges(txs: readonly PriceTx[], latestMonth: string): PriceChangeReport {
  const upTo = txs.filter((t) => t.statementMonth <= latestMonth);
  const parents = upTo.filter((t) => t.kind === "avista" && !t.hiddenAggregate);
  const usdParents = parents.filter((t) => (t.amountUsdCents ?? 0) > 0);
  const iofs = upTo.filter((t) => t.kind === "encargo" && /\bIOF\b/i.test(t.descriptionRaw) && !(t.amountUsdCents ?? 0));
  const iofOf = matchIof(usdParents as unknown as UsdTx[], iofs as unknown as UsdTx[]) as unknown as Map<PriceTx, number>;

  const groups = new Map<string, PriceTx[]>();
  for (const t of parents) {
    const key = merchantKey(t.descriptionRaw);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const out: PriceChange[] = [];
  for (const [key, list] of groups) {
    const byMonth = new Map<string, PriceTx[]>();
    for (const t of list) (byMonth.get(t.statementMonth) ?? byMonth.set(t.statementMonth, []).get(t.statementMonth)!).push(t);
    if ([...byMonth.values()].some((v) => v.length > 2)) continue; // compra frequente, não assinatura
    const months = [...byMonth.keys()].sort();
    const charges: Charge[] = months.map((m) => {
      const tx = [...byMonth.get(m)!].sort((a, b) => a.postedOn.localeCompare(b.postedOn))[0]!;
      return { month: m, tx, costCents: tx.amountCents + (iofOf.get(tx) ?? 0), usdCents: (tx.amountUsdCents ?? 0) > 0 ? tx.amountUsdCents! : null };
    });
    const last = charges[charges.length - 1]!;
    const label = last.tx.merchantName ?? decodeDescription(last.tx.descriptionRaw).display;
    const categoryId = last.tx.categoryId;
    const isSub = categoryId === CAT.ASSINATURAS;
    // Fora de "Assinaturas", só contas (casa, serviços, saúde, educação) com 1 cobrança por mês:
    // posto, mercado e restaurante repetem valor por acaso.
    if (!isSub && (!BILL_CATEGORIES.has(categoryId ?? -1) || [...byMonth.values()].some((v) => v.length > 1))) continue;
    const base = { key, label, categoryId, months, month: last.month, skippedMonths: 0, priceEffectCents: null, fxEffectCents: null };

    if (charges.length === 1) {
      if (last.month === latestMonth && isSub) {
        out.push({ ...base, status: "nova", prevMonth: null, fromCents: null, toCents: last.costCents, diffCents: last.costCents, annualDiffCents: last.costCents * 12, percent: null, inUsd: last.usdCents !== null, fromUsdCents: null, toUsdCents: last.usdCents });
      }
      continue;
    }

    // É recorrência? Valores comparados em US$ quando todas as cobranças têm US$ (o câmbio varia).
    const allUsd = charges.every((c) => c.usdCents !== null);
    const unit = charges.map((c) => (allUsd ? c.usdCents! : c.costCents));
    const pairs = unit.slice(1).map((v, i) => ratio(unit[i]!, v));
    if (pairs.some((r) => r > MAX_JUMP)) continue;
    const historyJumps = pairs.slice(0, -1).filter((r) => r > STABLE).length;
    const lastJump = pairs[pairs.length - 1]! > STABLE;
    // Fora de "Assinaturas" o histórico precisa ser estável e com ≥ 2 meses antes de aceitar um salto.
    if (isSub ? historyJumps > 1 : historyJumps > 0 || (lastJump && pairs.length < 2)) continue;

    const prev = charges[charges.length - 2]!;

    if (last.month < latestMonth) {
      if (last.month !== addMonthsToKey(latestMonth, -1)) continue; // encerrada há mais tempo: não é novidade
      out.push({ ...base, status: "sumiu", prevMonth: prev.month, fromCents: last.costCents, toCents: null, diffCents: -last.costCents, annualDiffCents: -last.costCents * 12, percent: -100, inUsd: last.usdCents !== null, fromUsdCents: last.usdCents, toUsdCents: null });
      continue;
    }

    const from = prev.costCents;
    const to = last.costCents;
    const diff = to - from;
    const inUsd = prev.usdCents !== null && last.usdCents !== null;
    let status: PriceChangeStatus = "igual";
    let priceEffect: number | null = null;
    let fxEffect: number | null = null;
    if (passes(from, diff, PRICE_CHANGE_MIN_CENTS)) {
      status = diff > 0 ? "aumentou" : "caiu";
      if (inUsd) {
        const usdDiff = last.usdCents! - prev.usdCents!;
        // parte do preço convertida ao custo atual por US$ (já com IOF); o resto é câmbio
        priceEffect = Math.round((usdDiff * to) / last.usdCents!);
        fxEffect = diff - priceEffect;
        const realChange = usdDiff !== 0 && Math.sign(usdDiff) === Math.sign(diff) && passes(prev.usdCents!, usdDiff, 1);
        if (!realChange) status = "cambio";
      }
    }
    out.push({
      ...base, status, prevMonth: prev.month, fromCents: from, toCents: to,
      diffCents: diff, annualDiffCents: diff * 12, percent: pct(from, diff),
      skippedMonths: monthsBetween(prev.month, last.month) - 1,
      inUsd, fromUsdCents: prev.usdCents, toUsdCents: last.usdCents,
      priceEffectCents: priceEffect, fxEffectCents: fxEffect,
    });
  }

  const order: Record<PriceChangeStatus, number> = { aumentou: 0, nova: 1, cambio: 2, sumiu: 3, caiu: 4, igual: 5 };
  const items = out
    .filter((c) => c.status !== "igual")
    .sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.annualDiffCents) - Math.abs(a.annualDiffCents) || a.label.localeCompare(b.label));
  const increases = items.filter((c) => c.status === "aumentou");
  const monthly = increases.reduce((a, c) => a + c.diffCents, 0);
  return { month: latestMonth, items, increases, increaseMonthlyCents: monthly, increaseAnnualCents: monthly * 12 };
}

function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number) as [number, number];
  const [yb, mb] = b.split("-").map(Number) as [number, number];
  return (yb - ya) * 12 + (mb - ma);
}
