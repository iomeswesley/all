// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { addDays, addMonths, diffDays, splitIso, isoDate, daysInMonth, type IsoDate } from "./dates.ts";
import { merchantKey, decodeDescription } from "./normalize.ts";
import type { TxKind } from "./parsers/types.ts";

export interface PurchaseWindow {
  /** primeiro dia da próxima fatura: comprando aqui, o pagamento é o mais distante possível */
  bestDay: IsoDate;
  bestDayDueDate: IsoDate;
  daysToPayBest: number;
  /** último dia antes do fechamento: comprando aqui, a fatura vence logo */
  worstDay: IsoDate;
  worstDayDueDate: IsoDate;
  daysToPayWorst: number;
}

const clampDay = (y: number, m: number, d: number) => isoDate(y, m, Math.min(d, daysInMonth(y, m)));

/**
 * Melhor dia de compra a partir da fatura (que informa o "melhor dia para compras").
 * A fatura que começa no melhor dia fecha ~1 mês depois e vence no mesmo dia do vencimento atual.
 */
export function purchaseWindow(statement: { dueDate: IsoDate; bestPurchaseDate: IsoDate | null; closingDate: IsoDate }): PurchaseWindow {
  const best = statement.bestPurchaseDate ?? addDays(statement.closingDate, 1);
  const dueDay = splitIso(statement.dueDate).d;
  const dueAfter = (closing: IsoDate): IsoDate => {
    const c = splitIso(closing);
    // vence no mês seguinte ao fechamento, no dia de vencimento do cartão
    const next = addMonths(isoDate(c.y, c.m, 1), 1);
    const n = splitIso(next);
    return clampDay(n.y, n.m, dueDay);
  };
  const closeOfBest = addDays(addMonths(best, 1), -1);
  const bestDue = dueAfter(closeOfBest);
  // o pior dia é o do fechamento da fatura em curso (a que começa 1 mês antes do melhor dia)
  const worst = addDays(best, -1);
  const worstDue = dueAfter(worst);
  return { bestDay: best, bestDayDueDate: bestDue, daysToPayBest: diffDays(bestDue, best), worstDay: worst, worstDayDueDate: worstDue, daysToPayWorst: diffDays(worstDue, worst) };
}

export interface UsdTx {
  postedOn: IsoDate;
  descriptionRaw: string;
  descriptionClean?: string;
  merchantName?: string | null;
  amountCents: number;
  amountUsdCents?: number | null;
  fxRate?: number | null;
  kind: TxKind;
  statementMonth: string;
  cardLast4?: string | null;
}

export interface UsdService {
  key: string;
  label: string;
  charges: number;
  months: number;
  avgUsdCents: number;
  avgBrlCents: number;
  lastFx: number | null;
  prevFx: number | null;
  /** variação do câmbio entre as duas últimas cobranças, em % */
  fxChangePercent: number | null;
  iofCents: number;
  /** IOF efetivo sobre o valor em R$ (≈3,5% em compras no exterior) */
  iofPercent: number | null;
  /** custo mensal médio em R$ já com IOF */
  monthlyCostCents: number;
  annualCostCents: number;
}

/** Liga cada linha de IOF à compra em dólar do mesmo dia com proporção mais próxima de 3,5%. */
export function matchIof(parents: readonly UsdTx[], iofs: readonly UsdTx[]): Map<UsdTx, number> {
  const out = new Map<UsdTx, number>();
  const used = new Set<UsdTx>();
  for (const iof of iofs) {
    let best: UsdTx | null = null;
    let bestErr = Infinity;
    for (const p of parents) {
      if (used.has(p) || p.postedOn !== iof.postedOn || (iof.cardLast4 && p.cardLast4 && iof.cardLast4 !== p.cardLast4)) continue;
      const err = Math.abs(iof.amountCents / p.amountCents - 0.035);
      if (err < bestErr) { best = p; bestErr = err; }
    }
    if (best && bestErr < 0.02) { used.add(best); out.set(best, (out.get(best) ?? 0) + iof.amountCents); }
  }
  return out;
}

export function usdServices(txs: readonly UsdTx[]): UsdService[] {
  const parents = txs.filter((t) => t.kind === "avista" && (t.amountUsdCents ?? 0) > 0);
  const iofs = txs.filter((t) => t.kind === "encargo" && /\bIOF\b/i.test(t.descriptionRaw) && !(t.amountUsdCents ?? 0));
  const iofOf = matchIof(parents, iofs);
  const groups = new Map<string, UsdTx[]>();
  for (const p of parents) (groups.get(merchantKey(p.descriptionRaw)) ?? groups.set(merchantKey(p.descriptionRaw), []).get(merchantKey(p.descriptionRaw))!).push(p);

  const out: UsdService[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.postedOn.localeCompare(b.postedOn));
    const months = new Set(sorted.map((t) => t.statementMonth));
    const fx = sorted.map((t) => t.fxRate ?? (t.amountUsdCents ? t.amountCents / t.amountUsdCents : null)).filter((x): x is number => x !== null && x > 0);
    const brl = sorted.reduce((a, t) => a + t.amountCents, 0);
    const iof = sorted.reduce((a, t) => a + (iofOf.get(t) ?? 0), 0);
    const monthly = Math.round((brl + iof) / months.size);
    const last = fx[fx.length - 1] ?? null;
    const prev = fx.length > 1 ? fx[fx.length - 2]! : null;
    out.push({
      key,
      label: sorted[0]!.merchantName ?? decodeDescription(sorted[0]!.descriptionRaw).display,
      charges: sorted.length,
      months: months.size,
      avgUsdCents: Math.round(sorted.reduce((a, t) => a + (t.amountUsdCents ?? 0), 0) / sorted.length),
      avgBrlCents: Math.round(brl / sorted.length),
      lastFx: last,
      prevFx: prev,
      fxChangePercent: last && prev ? Math.round(((last - prev) / prev) * 1000) / 10 : null,
      iofCents: iof,
      iofPercent: brl > 0 && iof > 0 ? Math.round((iof / brl) * 1000) / 10 : null,
      monthlyCostCents: monthly,
      annualCostCents: monthly * 12,
    });
  }
  return out.sort((a, b) => b.annualCostCents - a.annualCostCents);
}
