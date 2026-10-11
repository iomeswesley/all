// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { CAT } from "./categories.ts";
import { addMonthsToKey } from "./dates.ts";
import { decodeDescription, merchantKey } from "./normalize.ts";
import type { TxKind } from "./parsers/types.ts";

export interface RecurringTx {
  statementMonth: string;
  postedOn: string;
  descriptionRaw: string;
  merchantName?: string | null;
  amountCents: number;
  amountUsdCents?: number | null;
  categoryId: number | null;
  kind: TxKind;
}

export type RecurringAlert = "duplicada" | "mudou_valor" | "encerrada";

export interface RecurringItem {
  key: string;
  label: string;
  categoryId: number | null;
  months: string[];
  /** último valor cobrado (R$) */
  lastCents: number;
  /** valor típico mensal (mediana, R$) */
  typicalCents: number;
  /** custo anual estimado = valor típico × 12 */
  annualCents: number;
  inUsd: boolean;
  active: boolean;
  alerts: RecurringAlert[];
}

export interface RecurringReport {
  items: RecurringItem[];
  /** Cobranças de assinatura que apareceram pela 1ª vez no último mês */
  newSubscriptions: { key: string; label: string; amountCents: number }[];
  monthlyTotalCents: number;
  annualTotalCents: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

const similar = (a: number, b: number, tol: number) => a > 0 && b > 0 && Math.max(a, b) / Math.min(a, b) <= 1 + tol;

/**
 * Detecta cobranças mensais: mesmo estabelecimento em ≥2 meses, no máximo 2
 * cobranças por mês e valores parecidos (±10%; em US$ quando houver, pois o
 * câmbio varia). Padaria diária ou valores soltos não entram.
 */
export function detectRecurring(txs: readonly RecurringTx[], latestMonth: string): RecurringReport {
  const groups = new Map<string, RecurringTx[]>();
  for (const t of txs) {
    if (t.kind !== "avista") continue;
    const key = merchantKey(t.descriptionRaw);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const items: RecurringItem[] = [];
  const newSubscriptions: RecurringReport["newSubscriptions"] = [];

  for (const [key, list] of groups) {
    const byMonth = new Map<string, RecurringTx[]>();
    for (const t of list) (byMonth.get(t.statementMonth) ?? byMonth.set(t.statementMonth, []).get(t.statementMonth)!).push(t);
    const months = [...byMonth.keys()].sort();
    const label = list[0]!.merchantName ?? decodeDescription(list[0]!.descriptionRaw).display;
    const categoryId = list[list.length - 1]!.categoryId;

    // Primeira aparição de uma assinatura conhecida no último mês.
    if (months.length === 1 && months[0] === latestMonth && categoryId === CAT.ASSINATURAS) {
      newSubscriptions.push({ key, label, amountCents: byMonth.get(latestMonth)!.reduce((a, t) => a + t.amountCents, 0) });
      continue;
    }
    if (months.length < 2) continue;
    if ([...byMonth.values()].some((v) => v.length > 2 && !similar(Math.min(...v.map((t) => t.amountCents)), Math.max(...v.map((t) => t.amountCents)), 0.1))) continue;
    if ([...byMonth.values()].some((v) => v.length > 3)) continue;

    const inUsd = list.every((t) => (t.amountUsdCents ?? 0) > 0);
    const valueOf = (t: RecurringTx) => (inUsd ? t.amountUsdCents! : t.amountCents);
    const monthlyValues = months.map((m) => valueOf(byMonth.get(m)![0]!));
    const lo = Math.min(...monthlyValues);
    const hi = Math.max(...monthlyValues);
    if (!similar(lo, hi, 0.1)) continue;

    const monthlyBrl = months.map((m) => byMonth.get(m)![0]!.amountCents);
    const typical = median(monthlyBrl);
    const last = byMonth.get(months[months.length - 1]!)!;
    const active = months[months.length - 1] === latestMonth;
    const alerts: RecurringAlert[] = [];

    if (active && last.length > 1 && similar(last[0]!.amountCents, last[1]!.amountCents, 0.1)) alerts.push("duplicada");
    if (months.length >= 2 && !inUsd) {
      const prev = monthlyBrl[monthlyBrl.length - 2]!;
      const cur = monthlyBrl[monthlyBrl.length - 1]!;
      if (!similar(prev, cur, 0.03)) alerts.push("mudou_valor");
    }
    if (!active) alerts.push("encerrada");

    items.push({
      key, label, categoryId, months,
      lastCents: last[0]!.amountCents, typicalCents: typical, annualCents: typical * 12,
      inUsd, active, alerts,
    });
  }

  items.sort((a, b) => b.annualCents - a.annualCents);
  const activeItems = items.filter((i) => i.active);
  return {
    items,
    newSubscriptions,
    monthlyTotalCents: activeItems.reduce((a, i) => a + i.typicalCents, 0),
    annualTotalCents: activeItems.reduce((a, i) => a + i.annualCents, 0),
  };
}

/** Meses consecutivos até `latest` em que o item apareceu. */
export function streakMonths(item: Pick<RecurringItem, "months">, latest: string): number {
  let n = 0;
  for (let m = latest; item.months.includes(m); m = addMonthsToKey(m, -1)) n++;
  return n;
}
