import { addDays, addMonths, addMonthsToKey, isValidDate, monthKey, splitIso, type IsoDate } from "./dates.ts";

/**
 * Gastos futuros que o casal já sabe que vão acontecer: IPVA em janeiro, viagem em julho,
 * matrícula todo ano, a parcela do móvel que ainda não está na fatura…
 * Entram na previsão do mês em que caem, somados à média do histórico.
 */
export type PlannedRepeat = "once" | "monthly" | "yearly";

export const REPEAT_LABEL: Record<PlannedRepeat, string> = { once: "Uma vez", monthly: "Todo mês", yearly: "Todo ano" };

export interface PlannedExpense {
  id: string;
  description: string;
  amountCents: number;
  /** data da 1ª ocorrência */
  firstDate: IsoDate;
  repeat: PlannedRepeat;
  /** quantas vezes acontece (null = sem fim; "once" é sempre 1) */
  occurrences: number | null;
  categoryId: number | null;
}

export interface PlannedOccurrence {
  id: string;
  description: string;
  amountCents: number;
  date: IsoDate;
  categoryId: number | null;
  repeat: PlannedRepeat;
  /** "3/10" para séries finitas */
  label: string | null;
}

export const MAX_PLANNED_CENTS = 100_000_000; // R$ 1.000.000,00
export const MAX_PLANNED_OCCURRENCES = 120;

export type PlannedInput = Omit<PlannedExpense, "id">;

export function validatePlanned(p: PlannedInput): string | null {
  if (!p.description.trim()) return "Diga o que é (ex.: IPVA).";
  if (p.description.trim().length > 80) return "Descrição muito longa (máx. 80).";
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) return "Informe um valor maior que zero.";
  if (p.amountCents > MAX_PLANNED_CENTS) return "Valor acima de R$ 1.000.000,00.";
  let parts: { y: number; m: number; d: number };
  try {
    parts = splitIso(p.firstDate);
  } catch {
    return "Data inválida.";
  }
  if (!isValidDate(parts.y, parts.m, parts.d)) return "Data inexistente.";
  if (p.repeat !== "once" && p.occurrences !== null && (!Number.isInteger(p.occurrences) || p.occurrences < 1 || p.occurrences > MAX_PLANNED_OCCURRENCES)) {
    return `Repetições entre 1 e ${MAX_PLANNED_OCCURRENCES}.`;
  }
  return null;
}

const stepMonths = (r: PlannedRepeat) => (r === "yearly" ? 12 : 1);

/** Ocorrências de um gasto planejado entre duas datas (inclusive). O dia é mantido (limitado ao fim do mês). */
export function occurrencesBetween(p: PlannedExpense, from: IsoDate, to: IsoDate): PlannedOccurrence[] {
  const out: PlannedOccurrence[] = [];
  const total = p.repeat === "once" ? 1 : p.occurrences;
  const step = stepMonths(p.repeat);
  // pula direto para perto de `from` em séries longas
  let i = 0;
  if (p.repeat !== "once" && p.firstDate < from) {
    const a = splitIso(p.firstDate);
    const b = splitIso(from);
    const monthsGap = (b.y - a.y) * 12 + (b.m - a.m);
    i = Math.max(Math.floor(monthsGap / step) - 1, 0);
  }
  for (; total === null || i < total; i++) {
    const date = addMonths(p.firstDate, i * step);
    if (date > to) break;
    if (date >= from) {
      out.push({ id: p.id, description: p.description, amountCents: p.amountCents, date, categoryId: p.categoryId, repeat: p.repeat, label: total !== null && total > 1 ? `${i + 1}/${total}` : null });
    }
  }
  return out;
}

const lastDayOf = (key: string) => addDays(`${addMonthsToKey(key, 1)}-01`, -1);

/** Total e itens planejados por mês ("AAAA-MM"), para os meses pedidos. */
export function plannedByMonth(items: readonly PlannedExpense[], months: readonly string[]): Map<string, { totalCents: number; items: PlannedOccurrence[] }> {
  const map = new Map(months.map((m) => [m, { totalCents: 0, items: [] as PlannedOccurrence[] }]));
  if (months.length === 0) return map;
  const sorted = [...months].sort();
  const from = `${sorted[0]}-01`;
  const end = lastDayOf(sorted[sorted.length - 1]!);
  for (const p of items) {
    for (const o of occurrencesBetween(p, from, end)) {
      const slot = map.get(monthKey(o.date));
      if (!slot) continue;
      slot.items.push(o);
      slot.totalCents += o.amountCents;
    }
  }
  for (const slot of map.values()) slot.items.sort((a, b) => a.date.localeCompare(b.date) || b.amountCents - a.amountCents);
  return map;
}

/** Próximas ocorrências a partir de hoje (inclusive), em ordem de data. */
export function upcomingPlanned(items: readonly PlannedExpense[], today: IsoDate, days = 60, limit = 20): PlannedOccurrence[] {
  const to = addDays(today, days);
  return items
    .flatMap((p) => occurrencesBetween(p, today, to))
    .sort((a, b) => a.date.localeCompare(b.date) || b.amountCents - a.amountCents)
    .slice(0, limit);
}

/** Texto curto da repetição: "Uma vez", "Todo mês · 10x", "Todo ano". */
export function repeatSummary(p: Pick<PlannedExpense, "repeat" | "occurrences">): string {
  if (p.repeat === "once") return REPEAT_LABEL.once;
  return p.occurrences ? `${REPEAT_LABEL[p.repeat]} · ${p.occurrences}x` : REPEAT_LABEL[p.repeat];
}

/** A série já terminou antes de `today`? (para esconder da lista principal) */
export function plannedEnded(p: PlannedExpense, today: IsoDate): boolean {
  const total = p.repeat === "once" ? 1 : p.occurrences;
  if (total === null) return false;
  return addMonths(p.firstDate, (total - 1) * stepMonths(p.repeat)) < today;
}

/** "20/01" (próxima vez que essa data chega), "20/01/2027" → ISO; null se inválida. */
export function parsePlannedDate(text: string, today: IsoDate): IsoDate | null {
  const t = text.trim();
  const short = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  const full = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const pad2 = (s: string) => s.padStart(2, "0");
  if (short) {
    const y = splitIso(today).y;
    for (const year of [y, y + 1]) {
      const iso = `${year}-${pad2(short[2]!)}-${pad2(short[1]!)}`;
      const p = splitIso(iso);
      if (!isValidDate(p.y, p.m, p.d)) continue;
      if (iso >= today) return iso;
    }
    return null;
  }
  if (full) {
    const iso = `${full[3]}-${pad2(full[2]!)}-${pad2(full[1]!)}`;
    const p = splitIso(iso);
    return isValidDate(p.y, p.m, p.d) ? iso : null;
  }
  return null;
}
