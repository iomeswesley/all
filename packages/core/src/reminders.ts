import { addDays, formatBrDayMonth, type IsoDate } from "./dates.ts";
import { formatBRL } from "./money.ts";
import { occurrencesBetween, type PlannedExpense } from "./planned.ts";

/**
 * Lembretes de gasto futuro: um aviso N dias antes e outro no dia de cada ocorrência.
 * O app agenda como notificações LOCAIS (sem servidor); aqui só decidimos o quê e quando.
 */
export type ReminderLeadDays = 1 | 3 | 7;
export const REMINDER_LEAD_OPTIONS: readonly ReminderLeadDays[] = [1, 3, 7];
export const DEFAULT_REMINDER_LEAD: ReminderLeadDays = 3;

/** iOS guarda no máximo 64 notificações locais agendadas por app; deixamos folga. */
export const MAX_SCHEDULED_REMINDERS = 48;
/** Prefixo dos identificadores — permite cancelar só os nossos, sem mexer em outros avisos. */
export const REMINDER_ID_PREFIX = "planned:";

export interface PlannedReminder {
  /** estável: "planned:<id>:<data>:<before|day>" (reagendar não duplica) */
  id: string;
  plannedId: string;
  occurrenceDate: IsoDate;
  kind: "before" | "day";
  /** horário local do disparo, "AAAA-MM-DDTHH:mm" */
  fireAt: string;
  title: string;
  body: string;
}

export interface ReminderOptions {
  /** agora, no horário local: "AAAA-MM-DDTHH:mm" (ou só "AAAA-MM-DD" = início do dia) */
  now: string;
  leadDays: ReminderLeadDays;
  /** hora do aviso (0–23); padrão 9h */
  hour?: number;
  /** quantos dias à frente olhar; padrão 120 */
  horizonDays?: number;
  /** teto de agendamentos; padrão MAX_SCHEDULED_REMINDERS */
  limit?: number;
  /** modo privacidade: não mostra o valor na tela bloqueada */
  hideAmounts?: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function whenText(lead: number): string {
  if (lead === 0) return "hoje";
  if (lead === 1) return "amanhã";
  return `em ${lead} dias`;
}

/** Título e texto curtos de um lembrete. */
export function reminderMessage(o: { description: string; amountCents: number; date: IsoDate; label?: string | null }, lead: number, hideAmounts = false): { title: string; body: string } {
  const what = o.label ? `${o.description} (${o.label})` : o.description;
  const amount = hideAmounts ? "" : ` · ${formatBRL(o.amountCents)}`;
  if (lead === 0) return { title: "Gasto futuro hoje", body: `${what}${amount}` };
  return { title: `Gasto futuro ${whenText(lead)}`, body: `${what}${amount} · ${formatBrDayMonth(o.date)}` };
}

/**
 * Lista dos lembretes a agendar, em ordem de disparo, a partir de `now`.
 * Avisos cujo horário já passou ficam de fora (ex.: o "3 dias antes" de algo que é amanhã).
 */
export function plannedReminders(items: readonly PlannedExpense[], opts: ReminderOptions): PlannedReminder[] {
  const hour = Math.min(Math.max(Math.trunc(opts.hour ?? 9), 0), 23);
  const horizon = opts.horizonDays ?? 120;
  const limit = opts.limit ?? MAX_SCHEDULED_REMINDERS;
  const now = opts.now.length === 10 ? `${opts.now}T00:00` : opts.now.slice(0, 16);
  const today = now.slice(0, 10);
  const time = `T${pad2(hour)}:00`;

  const out: PlannedReminder[] = [];
  for (const p of items) {
    for (const o of occurrencesBetween(p, today, addDays(today, horizon))) {
      const leads = opts.leadDays > 0 ? [opts.leadDays, 0] : [0];
      for (const lead of leads) {
        const fireAt = `${addDays(o.date, -lead)}${time}`;
        if (fireAt <= now) continue;
        const kind = lead === 0 ? "day" : "before";
        out.push({ id: `${REMINDER_ID_PREFIX}${p.id}:${o.date}:${kind}`, plannedId: p.id, occurrenceDate: o.date, kind, fireAt, ...reminderMessage(o, lead, opts.hideAmounts) });
      }
    }
  }
  return out
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.occurrenceDate.localeCompare(b.occurrenceDate) || a.id.localeCompare(b.id))
    .slice(0, Math.max(limit, 0));
}

/** "AAAA-MM-DDTHH:mm" local → partes numéricas (para montar um Date no fuso do aparelho). */
export function splitFireAt(fireAt: string): { y: number; m: number; d: number; hh: number; mm: number } {
  const r = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(fireAt);
  if (!r) throw new Error(`Horário inválido: ${fireAt}`);
  return { y: Number(r[1]), m: Number(r[2]), d: Number(r[3]), hh: Number(r[4]), mm: Number(r[5]) };
}

export function isReminderLead(n: unknown): n is ReminderLeadDays {
  return n === 1 || n === 3 || n === 7;
}
