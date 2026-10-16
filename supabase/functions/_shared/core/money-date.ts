// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import type { BudgetStatus } from "./budget.ts";
import { CAT } from "./categories.ts";
import { buildCheckin, type Checkin, type CheckinTx } from "./checkin.ts";
import type { AnnuityInfo } from "./charges.ts";
import { addDays, addMonthsToKey, daysInMonth, formatBrDayMonth, formatMonthLong, isoDate, monthKey, splitIso, type IsoDate } from "./dates.ts";
import { forecastMonths, type ForecastMonth } from "./forecast.ts";
import { goalProgress, type GoalProgress } from "./goals.ts";
import { formatBRL } from "./money.ts";
import type { PlannedExpense } from "./planned.ts";
import type { RecurringItem } from "./recurring.ts";

/**
 * "Encontro do dinheiro": o check-in mensal como um roteiro de ~20 min para o casal fazer junto.
 * Pauta fixa (revisar o mês, caçar o que mudou, orçamento, assinaturas, próximo mês, metas e
 * combinados). Aqui só montamos os dados de cada passo — regras, sem IA.
 */
export type MoneyDateStepId = "mes" | "mudancas" | "orcamento" | "assinaturas" | "proximo" | "metas" | "combinados";

export interface MoneyDateStepInfo {
  id: MoneyDateStepId;
  title: string;
  /** pergunta curta que guia a conversa */
  prompt: string;
  minutes: number;
}

export const MONEY_DATE_STEPS: readonly MoneyDateStepInfo[] = [
  { id: "mes", title: "Como foi o mês", prompt: "O total foi o que vocês esperavam?", minutes: 3 },
  { id: "mudancas", title: "O que mudou", prompt: "Alguma surpresa? Algo que não reconhecem?", minutes: 3 },
  { id: "orcamento", title: "Orçamento", prompt: "O limite estava certo ou precisa de ajuste?", minutes: 3 },
  { id: "assinaturas", title: "Assinaturas", prompt: "Ainda usam tudo isso?", minutes: 3 },
  { id: "proximo", title: "Próximo mês", prompt: "Vem algum gasto grande que ainda não está aqui?", minutes: 3 },
  { id: "metas", title: "Metas", prompt: "Estão no ritmo? Dá para guardar mais?", minutes: 2 },
  { id: "combinados", title: "Combinados", prompt: "Até 3 combinados para o próximo mês.", minutes: 3 },
];

export const MONEY_DATE_MINUTES = MONEY_DATE_STEPS.reduce((a, s) => a + s.minutes, 0);
export const MAX_AGREEMENTS = 3;
export const MAX_AGREEMENT_LENGTH = 80;

export interface MoneyDateGoal {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  dueDate: IsoDate | null;
}

export interface MoneyDateInput {
  /** competência revisada ("AAAA-MM"), normalmente a da última fatura confirmada */
  month: string;
  txs: readonly CheckinTx[];
  /** limites vigentes no mês revisado */
  budgets?: ReadonlyMap<number, number>;
  annuity?: AnnuityInfo | null;
  planned?: readonly PlannedExpense[];
  goals?: readonly MoneyDateGoal[];
  today: IsoDate;
  incomeCents?: number;
}

export interface BudgetAdjust extends BudgetStatus {
  /** sugestão de novo limite: o gasto do mês arredondado para cima (múltiplo de R$ 50) */
  suggestedLimitCents: number;
}

export interface MoneyDate {
  month: string;
  nextMonth: string;
  checkin: Checkin;
  overview: {
    totalCents: number;
    prevTotalCents: number | null;
    deltaCents: number | null;
    deltaPercent: number | null;
    /** quanto a previsão (média + planejados) esperava para o mês; null sem histórico */
    forecastCents: number | null;
    vsForecastCents: number | null;
  };
  changes: Pick<Checkin, "risers" | "fallers" | "newMerchants">;
  budget: { adjust: BudgetAdjust[]; okCount: number; hasBudgets: boolean };
  subscriptions: { items: RecurringItem[]; monthlyCents: number; annualCents: number };
  next: ForecastMonth | null;
  goals: (MoneyDateGoal & { progress: GoalProgress })[];
}

const STEP_CENTS = 5000; // R$ 50
const MAX_SUBSCRIPTIONS = 8;

/** Arredonda para cima ao múltiplo de R$ 50 (mínimo R$ 50). */
export function roundUpLimit(cents: number): number {
  return Math.max(Math.ceil(cents / STEP_CENTS) * STEP_CENTS, STEP_CENTS);
}

export function buildMoneyDate(input: MoneyDateInput): MoneyDate {
  const { month, today } = input;
  const planned = input.planned ?? [];
  const checkin = buildCheckin({ month, txs: input.txs, budgets: input.budgets, annuity: input.annuity });

  // O que a previsão esperava para o mês revisado: média até o mês anterior + planejados do mês.
  const before = forecastMonths({ txs: input.txs, lastMonth: addMonthsToKey(month, -1), planned, today: `${month}-01`, horizon: 1 });
  const expected = before.basisMonths > 0 ? before.months[0] : undefined;
  const forecastCents = expected && expected.monthKey === month ? expected.totalCents : null;

  const adjust = checkin.budgets
    .filter((b) => b.level !== "ok")
    .map((b) => ({ ...b, suggestedLimitCents: Math.max(roundUpLimit(b.spentCents), b.limitCents) }))
    .sort((a, b) => b.percent - a.percent);

  const subs = checkin.recurring.items
    .filter((r) => r.active)
    // assinaturas primeiro, depois as demais cobranças mensais pelo custo anual
    .sort((a, b) => Number(b.categoryId === CAT.ASSINATURAS) - Number(a.categoryId === CAT.ASSINATURAS) || b.annualCents - a.annualCents)
    .slice(0, MAX_SUBSCRIPTIONS);

  const ahead = forecastMonths({ txs: input.txs, lastMonth: month, planned, today, incomeCents: input.incomeCents, horizon: 1 });

  return {
    month,
    nextMonth: ahead.months[0]?.monthKey ?? addMonthsToKey(month, 1),
    checkin,
    overview: {
      totalCents: checkin.totalCents,
      prevTotalCents: checkin.prevTotalCents,
      deltaCents: checkin.deltaCents,
      deltaPercent: checkin.deltaPercent,
      forecastCents,
      vsForecastCents: forecastCents === null ? null : checkin.totalCents - forecastCents,
    },
    changes: { risers: checkin.risers, fallers: checkin.fallers, newMerchants: checkin.newMerchants },
    budget: { adjust, okCount: checkin.budgets.length - adjust.length, hasBudgets: checkin.budgets.length > 0 },
    subscriptions: { items: subs, monthlyCents: checkin.recurring.monthlyTotalCents, annualCents: checkin.recurring.annualTotalCents },
    next: ahead.months[0] ?? null,
    goals: (input.goals ?? []).map((g) => ({ ...g, progress: goalProgress(g, today) })),
  };
}

// ───────────── combinados

/** Limpa os combinados: tira espaços, vazios e repetidos; no máximo 3, com até 80 caracteres. */
export function normalizeAgreements(list: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_AGREEMENT_LENGTH).trim();
    const key = text.toLocaleLowerCase("pt-BR");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === MAX_AGREEMENTS) break;
  }
  return out;
}

export interface MoneyDateRecord {
  /** "AAAA-MM" revisado */
  month: string;
  agreements: string[];
  completedAt: string | null;
}

/** Combinados que reaparecem: os do último encontro concluído antes do mês atual. */
export function previousAgreements(records: readonly MoneyDateRecord[], month: string): { month: string; agreements: string[] } | null {
  const prev = records
    .filter((r) => r.completedAt && r.month < month && r.agreements.length > 0)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  return prev ? { month: prev.month, agreements: prev.agreements } : null;
}

// ───────────── quando é o próximo encontro

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo … 6 = sábado
export const WEEKDAY_SHORT: Record<Weekday, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
export const WEEKDAY_LONG: Record<Weekday, string> = { 0: "domingo", 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado" };

export function weekdayOf(iso: IsoDate): Weekday {
  const { y, m, d } = splitIso(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

export interface MoneyDateSchedule {
  /** dia da semana do encontro (padrão sábado) */
  weekday: Weekday;
  /** o encontro é no primeiro `weekday` a partir deste dia do mês (ex.: dia seguinte ao vencimento) */
  afterDay: number;
}

export const DEFAULT_MONEY_DATE_SCHEDULE: MoneyDateSchedule = { weekday: 6, afterDay: 11 };

/** Data do encontro num mês ("AAAA-MM"): o primeiro `weekday` no dia `afterDay` ou depois. */
export function moneyDateInMonth(key: string, s: MoneyDateSchedule): IsoDate {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const day = Math.min(Math.max(Math.trunc(s.afterDay), 1), daysInMonth(y, m));
  const start = isoDate(y, m, day);
  return addDays(start, (s.weekday - weekdayOf(start) + 7) % 7);
}

/** Próximo encontro a partir de hoje (inclusive). */
export function nextMoneyDate(today: IsoDate, s: MoneyDateSchedule): IsoDate {
  const cur = moneyDateInMonth(monthKey(today), s);
  return cur >= today ? cur : moneyDateInMonth(addMonthsToKey(monthKey(today), 1), s);
}

/** Dia sugerido: o seguinte ao vencimento da última fatura (a fatura já chegou e foi conferida). */
export function suggestAfterDay(lastDueDate: IsoDate | null | undefined): number {
  if (!lastDueDate) return DEFAULT_MONEY_DATE_SCHEDULE.afterDay;
  return Math.min(splitIso(lastDueDate).d + 1, 28);
}

export const MONEY_DATE_ID_PREFIX = "money-date:";
export const MONEY_CANCEL_ID_PREFIX = "money-cancel:";

export interface MoneyDateReminder {
  id: string;
  date: IsoDate;
  /** horário local "AAAA-MM-DDTHH:mm" */
  fireAt: string;
  title: string;
  body: string;
}

/** Os próximos `count` lembretes mensais do encontro (ids estáveis por data: reagendar não duplica). */
export function moneyDateReminders(opts: { now: string; schedule: MoneyDateSchedule; hour?: number; count?: number }): MoneyDateReminder[] {
  const hour = Math.min(Math.max(Math.trunc(opts.hour ?? 10), 0), 23);
  const now = opts.now.length === 10 ? `${opts.now}T00:00` : opts.now.slice(0, 16);
  const time = `T${String(hour).padStart(2, "0")}:00`;
  const out: MoneyDateReminder[] = [];
  let key = monthKey(now.slice(0, 10));
  for (let guard = 0; out.length < (opts.count ?? 3) && guard < 24; guard++, key = addMonthsToKey(key, 1)) {
    const date = moneyDateInMonth(key, opts.schedule);
    const fireAt = `${date}${time}`;
    if (fireAt <= now) continue;
    const name = formatMonthLong(key).split(" ")[0]!.toLocaleLowerCase("pt-BR");
    out.push({ id: `${MONEY_DATE_ID_PREFIX}${date}`, date, fireAt, title: `Encontro do dinheiro de ${name} — ${MONEY_DATE_MINUTES} min`, body: "Pauta pronta: o mês, orçamento, assinaturas, próximo mês e combinados." });
  }
  return out;
}

/** Lembrete de cancelar uma assinatura marcada no encontro: no dia seguinte, às 19h. */
export function cancelReminder(item: { key: string; label: string; cents: number }, today: IsoDate, hideAmounts = false): MoneyDateReminder {
  const date = addDays(today, 1);
  return {
    id: `${MONEY_CANCEL_ID_PREFIX}${item.key}`,
    date,
    fireAt: `${date}T19:00`,
    title: `Cancelar ${item.label}`,
    body: hideAmounts ? "Combinado no encontro do dinheiro." : `Combinado no encontro do dinheiro · ${formatBRL(item.cents)}/mês`,
  };
}

/** Mostrar o atalho no Início? No começo do mês (até o dia 15) enquanto o encontro do mês revisado não foi concluído. */
export function shouldSuggestMoneyDate(today: IsoDate, reviewedMonth: string | null | undefined, doneMonths: ReadonlySet<string>): boolean {
  if (!reviewedMonth) return false;
  return splitIso(today).d <= 15 && !doneMonths.has(reviewedMonth);
}

/** Texto para compartilhar ao fim do encontro. */
export function moneyDateText(md: MoneyDate, agreements: readonly string[], toCancel: readonly { label: string; cents: number }[], nextDate?: IsoDate | null): string {
  const L: string[] = [`Encontro do dinheiro — ${formatMonthLong(md.month)}`, `Total: ${formatBRL(md.overview.totalCents)}`];
  if (md.overview.vsForecastCents !== null) L.push(`Vs previsto: ${md.overview.vsForecastCents > 0 ? "+" : ""}${formatBRL(md.overview.vsForecastCents)}`);
  if (md.next) L.push(`Previsto para ${formatMonthLong(md.next.monthKey)}: ${formatBRL(md.next.totalCents)}`);
  if (toCancel.length) L.push("", "Cancelar:", ...toCancel.map((c) => `• ${c.label} (${formatBRL(c.cents)}/mês)`));
  if (agreements.length) L.push("", "Combinados:", ...agreements.map((a) => `• ${a}`));
  if (nextDate) L.push("", `Próximo encontro: ${formatBrDayMonth(nextDate)}`);
  return L.join("\n");
}
