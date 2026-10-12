import { addMonthsToKey } from "./dates.ts";
import { decodeDescription, merchantKey } from "./normalize.ts";
import type { TxKind } from "./parsers/types.ts";

export interface HabitTx {
  statementMonth: string;
  descriptionRaw: string;
  merchantName?: string | null;
  amountCents: number;
  kind: TxKind;
  categoryId: number | null;
  hiddenAggregate?: boolean;
}

export interface Habit {
  key: string;
  label: string;
  categoryId: number | null;
  /** meses com dados considerados na análise */
  monthsAnalyzed: number;
  visits: number;
  visitsPerMonth: number;
  /** frequência por semana (visitsPerMonth / 4,35) */
  visitsPerWeek: number;
  avgTicketCents: number;
  /** gasto médio por mês */
  monthlyCostCents: number;
  annualCostCents: number;
  /** economia mensal se cortar 1 visita em cada 4 */
  saveIfCutQuarterCents: number;
  cadence: string;
}

export interface HabitOptions {
  windowMonths?: number;
  minVisitsPerMonth?: number;
  minMonthlyCents?: number;
}

export function cadenceText(perWeek: number): string {
  if (perWeek >= 5) return "quase todo dia";
  if (perWeek >= 3) return "umas 3 a 5 vezes por semana";
  if (perWeek >= 1.5) return "umas 2 vezes por semana";
  return "cerca de 1 vez por semana";
}

/**
 * "Custo do hábito": estabelecimentos visitados com muita frequência (ex.: padaria quase diária)
 * e quanto isso custa por ano. Assinaturas (1–2 cobranças/mês) ficam de fora de propósito.
 */
export function detectHabits(txs: readonly HabitTx[], latestMonth: string, opts: HabitOptions = {}): Habit[] {
  const { windowMonths = 6, minVisitsPerMonth = 6, minMonthlyCents = 10000 } = opts;
  const window = Array.from({ length: windowMonths }, (_, i) => addMonthsToKey(latestMonth, -i));
  const inWindow = txs.filter((t) => window.includes(t.statementMonth) && !t.hiddenAggregate);
  const monthsWithData = new Set(inWindow.map((t) => t.statementMonth)).size;
  if (monthsWithData === 0) return [];

  const groups = new Map<string, HabitTx[]>();
  for (const t of inWindow) {
    if (t.kind !== "avista" || t.amountCents <= 0) continue;
    const key = merchantKey(t.descriptionRaw);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const habits: Habit[] = [];
  for (const [key, list] of groups) {
    const months = new Set(list.map((t) => t.statementMonth)).size;
    if (monthsWithData > 1 && months < Math.ceil(monthsWithData / 2)) continue;
    const visitsPerMonth = list.length / monthsWithData;
    const total = list.reduce((a, t) => a + t.amountCents, 0);
    const monthlyCost = Math.round(total / monthsWithData);
    if (visitsPerMonth < minVisitsPerMonth || monthlyCost < minMonthlyCents) continue;
    const perWeek = visitsPerMonth / 4.35;
    habits.push({
      key,
      label: list[0]!.merchantName ?? decodeDescription(list[0]!.descriptionRaw).display,
      categoryId: list[list.length - 1]!.categoryId,
      monthsAnalyzed: monthsWithData,
      visits: list.length,
      visitsPerMonth: Math.round(visitsPerMonth * 10) / 10,
      visitsPerWeek: Math.round(perWeek * 10) / 10,
      avgTicketCents: Math.round(total / list.length),
      monthlyCostCents: monthlyCost,
      annualCostCents: monthlyCost * 12,
      saveIfCutQuarterCents: Math.round(monthlyCost * 0.25),
      cadence: cadenceText(perWeek),
    });
  }
  return habits.sort((a, b) => b.annualCostCents - a.annualCostCents);
}
