// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { addDays, addMonthsToKey, daysInMonth, isoDate, splitIso, type IsoDate } from "./dates.ts";
import { merchantKey } from "./normalize.ts";
import { occurrencesBetween, type PlannedExpense } from "./planned.ts";
import type { RecurringItem, RecurringTx } from "./recurring.ts";

/**
 * Calendário do mês: grade de semanas (domingo a sábado) e, por dia, o que deve cair nele —
 * gastos planejados e cobranças recorrentes esperadas (no dia típico em que costumam vir).
 */

/** Recorrência esperada todo mês num dia típico (1–31; limitado ao último dia do mês). */
export interface ExpectedRecurring {
  key: string;
  label: string;
  amountCents: number;
  /** dia típico do mês (1–31) */
  day: number;
  categoryId: number | null;
  /** 1º mês em que apareceu ("AAAA-MM"); antes disso não entra no calendário */
  sinceMonth?: string;
}

export type CalendarEventKind = "planned" | "recurring";

export interface CalendarEvent {
  kind: CalendarEventKind;
  /** id do gasto planejado ou chave da recorrência */
  id: string;
  label: string;
  amountCents: number;
  date: IsoDate;
  categoryId: number | null;
  /** "3/10" em séries finitas de planejados */
  note: string | null;
}

export interface CalendarDay {
  date: IsoDate;
  day: number;
  /** pertence ao mês exibido? (dias de fora completam a 1ª e a última semana) */
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  totalCents: number;
}

export interface CalendarMonth {
  monthKey: string;
  /** semanas de 7 dias, começando no domingo */
  weeks: CalendarDay[][];
  totalCents: number;
  plannedCents: number;
  recurringCents: number;
  /** dias do mês com algum evento */
  busyDays: number;
}

/** Cabeçalho das colunas (domingo primeiro). */
export const WEEKDAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

/** Dia da semana (0 = domingo) de uma data ISO. */
export function weekday(iso: IsoDate): number {
  const { y, m, d } = splitIso(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const sortEvents = (a: CalendarEvent, b: CalendarEvent) =>
  a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "planned" ? -1 : 1) || b.amountCents - a.amountCents || a.label.localeCompare(b.label);

/** Eventos do mês (planejados + recorrentes), em ordem de data. */
export function monthEvents(monthKey: string, planned: readonly PlannedExpense[], recurring: readonly ExpectedRecurring[] = []): CalendarEvent[] {
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  const last = daysInMonth(y, m);
  const from = isoDate(y, m, 1);
  const to = isoDate(y, m, last);
  const out: CalendarEvent[] = [];
  for (const p of planned) {
    for (const o of occurrencesBetween(p, from, to)) {
      out.push({ kind: "planned", id: o.id, label: o.description, amountCents: o.amountCents, date: o.date, categoryId: o.categoryId, note: o.label });
    }
  }
  for (const r of recurring) {
    if (!Number.isInteger(r.day) || r.day < 1 || r.amountCents <= 0) continue;
    if (r.sinceMonth && monthKey < r.sinceMonth) continue;
    out.push({ kind: "recurring", id: r.key, label: r.label, amountCents: r.amountCents, date: isoDate(y, m, Math.min(r.day, last)), categoryId: r.categoryId, note: null });
  }
  return out.sort(sortEvents);
}

/** Monta a grade do mês com os eventos de cada dia. */
export function buildCalendarMonth(opts: { monthKey: string; planned: readonly PlannedExpense[]; recurring?: readonly ExpectedRecurring[]; today?: IsoDate | null }): CalendarMonth {
  const { monthKey, planned, recurring = [], today = null } = opts;
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  const first = isoDate(y, m, 1);
  const lastDate = isoDate(y, m, daysInMonth(y, m));
  const start = addDays(first, -weekday(first));
  const end = addDays(lastDate, 6 - weekday(lastDate));

  const events = monthEvents(monthKey, planned, recurring);
  const byDate = new Map<IsoDate, CalendarEvent[]>();
  for (const e of events) (byDate.get(e.date) ?? byDate.set(e.date, []).get(e.date)!).push(e);

  const weeks: CalendarDay[][] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (weekday(d) === 0) weeks.push([]);
    const inMonth = d.startsWith(monthKey);
    const evs = inMonth ? byDate.get(d) ?? [] : [];
    weeks[weeks.length - 1]!.push({ date: d, day: splitIso(d).d, inMonth, isToday: d === today, events: evs, totalCents: evs.reduce((a, e) => a + e.amountCents, 0) });
  }

  const sum = (k?: CalendarEventKind) => events.filter((e) => !k || e.kind === k).reduce((a, e) => a + e.amountCents, 0);
  return { monthKey, weeks, totalCents: sum(), plannedCents: sum("planned"), recurringCents: sum("recurring"), busyDays: byDate.size };
}

/** Dia do calendário pela data (ou undefined). */
export function findCalendarDay(cal: CalendarMonth, date: IsoDate): CalendarDay | undefined {
  for (const w of cal.weeks) for (const d of w) if (d.date === date) return d;
  return undefined;
}

/** Mês anterior/seguinte, para navegação. */
export const shiftCalendarMonth = (monthKey: string, n: number) => addMonthsToKey(monthKey, n);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

/**
 * Recorrências ativas de `detectRecurring` → esperadas no calendário, com o dia típico
 * (mediana do dia em que a cobrança caiu nos lançamentos daquele estabelecimento).
 */
export function expectedRecurringFrom(items: readonly RecurringItem[], txs: readonly Pick<RecurringTx, "descriptionRaw" | "postedOn" | "kind" | "hiddenAggregate">[]): ExpectedRecurring[] {
  const active = items.filter((i) => i.active);
  if (active.length === 0) return [];
  const keys = new Set(active.map((i) => i.key));
  const days = new Map<string, number[]>();
  for (const t of txs) {
    if (t.kind !== "avista" || t.hiddenAggregate) continue;
    const k = merchantKey(t.descriptionRaw);
    if (!keys.has(k)) continue;
    try {
      (days.get(k) ?? days.set(k, []).get(k)!).push(splitIso(t.postedOn).d);
    } catch {
      /* data inválida: ignora */
    }
  }
  return active.flatMap((i) => {
    const ds = days.get(i.key);
    if (!ds || ds.length === 0) return [];
    return [{ key: i.key, label: i.label, amountCents: i.typicalCents, day: median(ds), categoryId: i.categoryId, sinceMonth: i.months[0] }];
  });
}
