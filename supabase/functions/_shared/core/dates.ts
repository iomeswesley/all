// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
/**
 * Datas como string ISO "AAAA-MM-DD" (sem fuso). Evita bugs de timezone.
 */

export type IsoDate = string;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function isoDate(y: number, m: number, d: number): IsoDate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidDate(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function splitIso(iso: IsoDate): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Data ISO inválida: "${iso}"`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** "06/09/2026" → "2026-09-06" */
export function parseBrDate(s: string): IsoDate {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) throw new Error(`Data inválida (dd/mm/aaaa): "${s}"`);
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isValidDate(y, mo, d)) throw new Error(`Data inexistente: "${s}"`);
  return isoDate(y, mo, d);
}

/** "29/06/26" → "2026-06-29" (anos 2000+) */
export function parseBrDateShort(s: string): IsoDate {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Data inválida (dd/mm/aa): "${s}"`);
  const [d, mo, y] = [Number(m[1]), Number(m[2]), 2000 + Number(m[3])];
  if (!isValidDate(y, mo, d)) throw new Error(`Data inexistente: "${s}"`);
  return isoDate(y, mo, d);
}

/** "2026-09-06" → "06/09/2026" */
export function formatBrDate(iso: IsoDate): string {
  const { y, m, d } = splitIso(iso);
  return `${pad(d)}/${pad(m)}/${pad(y, 4)}`;
}

/** "2026-09-06" → "06/09" */
export function formatBrDayMonth(iso: IsoDate): string {
  const { m, d } = splitIso(iso);
  return `${pad(d)}/${pad(m)}`;
}

/** "2026-09-06" → "2026-09" */
export function monthKey(iso: IsoDate): string {
  return iso.slice(0, 7);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-09" → "setembro de 2026" */
export function formatMonthLong(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MESES[m! - 1]} de ${y}`;
}

/** "2026-09" → "set/26" */
export function formatMonthShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MESES_ABREV[m! - 1]}/${String(y).slice(2)}`;
}

/** Soma meses mantendo o dia (limitado ao último dia do mês destino). */
export function addMonths(iso: IsoDate, n: number): IsoDate {
  const { y, m, d } = splitIso(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return isoDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addMonthsToKey(key: string, n: number): string {
  return monthKey(addMonths(`${key}-01`, n));
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  const { y, m, d } = splitIso(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  const A = splitIso(a);
  const B = splitIso(b);
  return Math.round((Date.UTC(A.y, A.m - 1, A.d) - Date.UTC(B.y, B.m - 1, B.d)) / 86400000);
}

/**
 * A fatura traz só "dd/mm". Descobre o ano.
 *
 * - À vista: a data mais recente que não passa do fechamento.
 * - Parcela n/total: a compra original foi ~(n-1) meses antes do fechamento;
 *   escolhe, entre os candidatos que não passam do fechamento, o mais perto disso.
 *   (Cobre compras com mais de 12 meses, comum em parcelamentos longos.)
 */
export function inferDate(day: number, month: number, closing: IsoDate, installmentN?: number): IsoDate {
  const c = splitIso(closing);
  const candidates: IsoDate[] = [];
  for (let y = c.y; y >= c.y - 4; y--) {
    if (!isValidDate(y, month, day)) continue;
    const iso = isoDate(y, month, day);
    if (iso <= closing) candidates.push(iso);
  }
  if (candidates.length === 0) throw new Error(`Não foi possível inferir o ano de ${pad(day)}/${pad(month)}`);
  if (!installmentN || installmentN <= 1) return candidates[0]!;
  const expected = addMonths(closing, -(installmentN - 1));
  return candidates.reduce((best, cur) =>
    Math.abs(diffDays(cur, expected)) < Math.abs(diffDays(best, expected)) ? cur : best,
  );
}
