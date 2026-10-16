import { spending, type AnalyticsTx } from "./analytics.ts";
import { levelOf } from "./budget.ts";
import { CAT } from "./categories.ts";
import { forecastMonths, monthHistory, type Forecast, type ForecastInput } from "./forecast.ts";

/**
 * Previsão por categoria, comparada ao orçamento:
 *   previsto(categoria, mês) = média da categoria nos últimos N meses com dados + planejados da categoria no mês.
 * Planejado sem categoria vai para "Outros". A soma das categorias bate exatamente com `forecastMonths`:
 * a média de cada categoria é arredondada pelo método do maior resto, para não sobrar nem faltar centavo.
 */
export interface CategoryForecast {
  categoryId: number;
  baselineCents: number;
  plannedCents: number;
  totalCents: number;
}

export interface CategoryForecastMonth {
  monthKey: string;
  /** igual ao `totalCents` do mesmo mês em `forecastMonths` */
  totalCents: number;
  /** ordenado do maior para o menor previsto */
  categories: CategoryForecast[];
}

/** Média por categoria nos meses com dados (os mesmos de `forecastMonths`); soma = média geral arredondada. */
export function categoryBaselines(txs: readonly AnalyticsTx[], lastMonth: string, window = 6): Map<number, number> {
  const months = new Set(monthHistory(txs, lastMonth, window).filter((h) => h.totalCents !== null).map((h) => h.monthKey));
  const out = new Map<number, number>();
  const n = months.size;
  if (n === 0) return out;
  const sums = new Map<number, number>();
  for (const t of spending(txs)) {
    if (!months.has(t.statementMonth)) continue;
    const id = t.categoryId ?? CAT.OUTROS;
    sums.set(id, (sums.get(id) ?? 0) + t.amountCents);
  }
  const total = [...sums.values()].reduce((a, v) => a + v, 0);
  const target = Math.round(total / n); // a mesma conta de forecastMonths
  // piso de cada média + resto (0..n-1), em inteiros, para distribuir os centavos que faltam
  const parts = [...sums.entries()].map(([id, s]) => {
    const floor = Math.floor(s / n);
    return { id, floor, rest: s - floor * n };
  });
  let missing = target - parts.reduce((a, p) => a + p.floor, 0);
  parts.sort((a, b) => b.rest - a.rest || a.id - b.id);
  for (const p of parts) {
    const extra = missing > 0 && p.rest > 0 ? 1 : 0;
    missing -= extra;
    out.set(p.id, p.floor + extra);
  }
  return out;
}

/** Previsão por categoria para cada mês previsto (reaproveita `forecast` se já calculado). */
export function forecastByCategory(input: ForecastInput, forecast: Forecast = forecastMonths(input)): CategoryForecastMonth[] {
  const base = categoryBaselines(input.txs, input.lastMonth, input.window ?? 6);
  return forecast.months.map((m) => {
    const planned = new Map<number, number>();
    for (const o of m.planned) {
      const id = o.categoryId ?? CAT.OUTROS;
      planned.set(id, (planned.get(id) ?? 0) + o.amountCents);
    }
    const ids = new Set([...base.keys(), ...planned.keys()]);
    const categories = [...ids]
      .map((categoryId) => {
        const baselineCents = base.get(categoryId) ?? 0;
        const plannedCents = planned.get(categoryId) ?? 0;
        return { categoryId, baselineCents, plannedCents, totalCents: baselineCents + plannedCents };
      })
      .sort((a, b) => b.totalCents - a.totalCents || a.categoryId - b.categoryId);
    return { monthKey: m.monthKey, totalCents: m.totalCents, categories };
  });
}

export type ForecastBudgetLevel = "ok" | "perto" | "estoura";

export const FORECAST_LEVEL_LABEL: Record<ForecastBudgetLevel, string> = { ok: "No caminho", perto: "Perto do limite", estoura: "Vai estourar" };

export interface CategoryBudgetForecast extends CategoryForecast {
  /** limite efetivo do mês (null = sem limite) */
  limitCents: number | null;
  /** previsto / limite em % (null sem limite) */
  percent: number | null;
  /** null sem limite */
  level: ForecastBudgetLevel | null;
  /** quanto passa do limite (0 se não passa ou sem limite) */
  overCents: number;
}

export interface ForecastBudgetComparison {
  monthKey: string;
  rows: CategoryBudgetForecast[];
  /** categorias com limite que vão estourar / ficar perto */
  over: number;
  near: number;
}

const RANK: Record<ForecastBudgetLevel, number> = { estoura: 0, perto: 1, ok: 2 };

/**
 * Compara o previsto do mês com o orçamento efetivo (use `effectiveBudgets(rows, monthKey)`).
 * Entram as categorias com previsto ≠ 0 e as que têm limite. Ordem: estoura, perto, depois por valor.
 */
export function forecastVsBudget(month: CategoryForecastMonth, limits: ReadonlyMap<number, number>): ForecastBudgetComparison {
  const byId = new Map(month.categories.map((c) => [c.categoryId, c]));
  for (const id of limits.keys()) if (!byId.has(id)) byId.set(id, { categoryId: id, baselineCents: 0, plannedCents: 0, totalCents: 0 });
  const rows: CategoryBudgetForecast[] = [];
  for (const c of byId.values()) {
    const limit = limits.get(c.categoryId);
    if (!limit || limit <= 0) {
      if (c.totalCents !== 0) rows.push({ ...c, limitCents: null, percent: null, level: null, overCents: 0 });
      continue;
    }
    const spent = Math.max(c.totalCents, 0);
    const lv = levelOf(spent, limit);
    const level: ForecastBudgetLevel = lv === "over100" ? "estoura" : lv === "warn80" ? "perto" : "ok";
    rows.push({ ...c, limitCents: limit, percent: Math.round((spent / limit) * 100), level, overCents: Math.max(spent - limit, 0) });
  }
  rows.sort((a, b) => (a.level ? RANK[a.level] : 3) - (b.level ? RANK[b.level] : 3) || b.totalCents - a.totalCents || a.categoryId - b.categoryId);
  return {
    monthKey: month.monthKey,
    rows,
    over: rows.filter((r) => r.level === "estoura").length,
    near: rows.filter((r) => r.level === "perto").length,
  };
}
