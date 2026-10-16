import { totalSpent, type AnalyticsTx } from "./analytics.ts";
import { addMonthsToKey, monthKey, type IsoDate } from "./dates.ts";
import { plannedByMonth, type PlannedExpense, type PlannedOccurrence } from "./planned.ts";

/**
 * Previsão simples e explicável dos próximos meses:
 *   previsto(mês) = média do gasto dos últimos N meses com dados + gastos planejados do mês.
 * O cartão é um gasto que sempre acontece: a média dele (e do Pix/dinheiro) já carrega parcelas,
 * assinaturas e o dia a dia. O que é novo ou pontual o casal informa como "planejado".
 */
export interface HistoryMonth {
  monthKey: string;
  /** null = mês sem nenhum dado (não entra na média) */
  totalCents: number | null;
  /** variação sobre o mês anterior com dados, em % arredondado (null se não houver base) */
  changePct: number | null;
}

export interface ForecastMonth {
  monthKey: string;
  baselineCents: number;
  plannedCents: number;
  totalCents: number;
  planned: PlannedOccurrence[];
  /** renda − previsto (null quando a renda não foi informada) */
  netCents: number | null;
}

export interface Forecast {
  history: HistoryMonth[];
  /** média usada como base */
  baselineCents: number;
  /** quantos meses entraram na média */
  basisMonths: number;
  months: ForecastMonth[];
  /** soma do previsto no horizonte */
  totalCents: number;
  /** mês com maior previsto */
  peak: ForecastMonth | null;
}

export interface ForecastInput {
  txs: readonly AnalyticsTx[];
  /** último mês com fatura fechada ("AAAA-MM"); a média termina nele */
  lastMonth: string;
  planned: readonly PlannedExpense[];
  today: IsoDate;
  incomeCents?: number;
  /** meses de histórico na média (padrão 6) */
  window?: number;
  /** meses previstos (padrão 6) */
  horizon?: number;
}

/** Primeiro mês previsto: o seguinte à última fatura, mas nunca antes do mês corrente. */
export function forecastStart(lastMonth: string, today: IsoDate): string {
  const next = addMonthsToKey(lastMonth, 1);
  const current = monthKey(today);
  return next > current ? next : current;
}

export function monthHistory(txs: readonly AnalyticsTx[], lastMonth: string, count: number): HistoryMonth[] {
  const byMonth = new Map<string, AnalyticsTx[]>();
  for (const t of txs) {
    const list = byMonth.get(t.statementMonth);
    if (list) list.push(t);
    else byMonth.set(t.statementMonth, [t]);
  }
  const out: HistoryMonth[] = [];
  let prev: number | null = null;
  for (let i = count - 1; i >= 0; i--) {
    const key = addMonthsToKey(lastMonth, -i);
    const list = byMonth.get(key);
    const total = list ? totalSpent(list) : null;
    const changePct = total !== null && prev !== null && prev > 0 ? Math.round(((total - prev) / prev) * 100) : null;
    out.push({ monthKey: key, totalCents: total, changePct });
    if (total !== null) prev = total;
  }
  return out;
}

export function forecastMonths(input: ForecastInput): Forecast {
  const window = input.window ?? 6;
  const horizon = input.horizon ?? 6;
  const history = monthHistory(input.txs, input.lastMonth, window);
  const withData = history.filter((h) => h.totalCents !== null);
  const baseline = withData.length === 0 ? 0 : Math.round(withData.reduce((a, h) => a + (h.totalCents ?? 0), 0) / withData.length);

  const start = forecastStart(input.lastMonth, input.today);
  const keys = Array.from({ length: horizon }, (_, i) => addMonthsToKey(start, i));
  // só o que ainda vai acontecer: ocorrências antes de hoje no mês corrente já estão (ou estarão) no histórico
  const planned = plannedByMonth(input.planned, keys);
  const income = input.incomeCents && input.incomeCents > 0 ? input.incomeCents : null;

  const months: ForecastMonth[] = keys.map((k) => {
    const slot = planned.get(k)!;
    const items = slot.items.filter((o) => o.date >= input.today);
    const plannedCents = items.reduce((a, o) => a + o.amountCents, 0);
    const total = baseline + plannedCents;
    return { monthKey: k, baselineCents: baseline, plannedCents, totalCents: total, planned: items, netCents: income === null ? null : income - total };
  });
  const peak = months.reduce<ForecastMonth | null>((p, m) => (p === null || m.totalCents > p.totalCents ? m : p), null);
  return { history, baselineCents: baseline, basisMonths: withData.length, months, totalCents: months.reduce((a, m) => a + m.totalCents, 0), peak };
}
