/**
 * Dinheiro sempre em centavos (inteiro). Nunca use float para valores.
 */

/** Converte "1.234,56", "-7.136,89", "R$ 1.234,56" ou "0,04" em centavos. */
export function parseBRL(input: string): number {
  const raw = input.trim().replace(/^(-?)\s*R\$\s*/i, "$1").replace(/\s+/g, "");
  const m = /^(-)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(raw);
  if (!m) throw new Error(`Valor monetário inválido: "${input}"`);
  const [, sign, intPart, dec = ""] = m;
  const cents = Number(intPart!.replace(/\./g, "")) * 100 + Number(dec.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error(`Valor fora do limite: "${input}"`);
  return sign ? -cents : cents;
}

/** Retorna null em vez de lançar erro. */
export function tryParseBRL(input: string): number | null {
  try {
    return parseBRL(input);
  } catch {
    return null;
  }
}

/** True se o texto parece um valor em BRL (ex.: "1.234,56", "-0,02"). */
export function looksLikeBRL(input: string): boolean {
  return /^-?(\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(input.trim());
}

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`Centavos deve ser inteiro: ${cents}`);
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const c = String(abs % 100).padStart(2, "0");
  return `${groupThousands(reais)},${c}`;
}

/** 123456 → "R$ 1.234,56"; -500 → "-R$ 5,00". */
export function formatBRL(cents: number): string {
  return `${cents < 0 ? "-" : ""}R$ ${formatCents(cents)}`;
}

/** 2126 → "US$ 21,26". */
export function formatUSD(cents: number): string {
  return `${cents < 0 ? "-" : ""}US$ ${formatCents(cents)}`;
}

/** Sem símbolo: 123456 → "1.234,56". */
export function formatNumberBR(cents: number): string {
  return `${cents < 0 ? "-" : ""}${formatCents(cents)}`;
}

export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Porcentagem inteira arredondada (para legendas de gráfico). */
export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}
