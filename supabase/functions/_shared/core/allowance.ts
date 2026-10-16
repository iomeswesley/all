// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { daysInMonth, splitIso, type IsoDate } from "./dates.ts";

/**
 * Mesada pessoal 🔒 ("dinheiro livre"): valor mensal de cada pessoa para gastar sem dar satisfação.
 * O "usado" é a soma do gasto pessoal do mês (vem pronto do banco, sem itens). Tudo em centavos inteiros.
 */

export type AllowanceLevel = "ok" | "perto" | "estourou";

export interface AllowanceInput {
  limitCents: number;
  usedCents: number;
  /** competência "AAAA-MM" */
  month: string;
  /** hoje, "AAAA-MM-DD" (fuso do aparelho) */
  today: IsoDate;
}

export interface AllowanceState {
  limitCents: number;
  /** nunca negativo (estornos maiores que os gastos contam como 0) */
  usedCents: number;
  /** usado / limite em % inteiro (pode passar de 100) */
  percent: number;
  /** limite − usado; negativo quando estourou */
  remainingCents: number;
  /** quanto passou do limite (0 se não passou) */
  overCents: number;
  /** dias que ainda contam no mês, incluindo hoje (0 para mês passado; o mês inteiro para mês futuro) */
  daysLeft: number;
  /** quanto dá para gastar por dia até o fim do mês (arredondado para baixo) */
  perDayCents: number;
  level: AllowanceLevel;
}

export const ALLOWANCE_WARN_PERCENT = 80;
export const ALLOWANCE_MAX_CENTS = 100_000_000;

export function allowanceLevel(usedCents: number, limitCents: number): AllowanceLevel {
  if (usedCents > limitCents) return "estourou";
  if (limitCents > 0 && usedCents * 100 >= limitCents * ALLOWANCE_WARN_PERCENT) return "perto";
  return "ok";
}

/** Dias restantes no mês `month` contando hoje. */
export function daysLeftInMonth(month: string, today: IsoDate): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = daysInMonth(y, m);
  const t = splitIso(today);
  const cur = `${t.y}-${String(t.m).padStart(2, "0")}`;
  if (month < cur) return 0;
  if (month > cur) return total;
  return total - t.d + 1;
}

export function allowanceState(input: AllowanceInput): AllowanceState {
  const limitCents = Math.max(0, Math.round(input.limitCents));
  const usedCents = Math.max(0, Math.round(input.usedCents));
  const remainingCents = limitCents - usedCents;
  const daysLeft = daysLeftInMonth(input.month, input.today);
  return {
    limitCents,
    usedCents,
    percent: limitCents > 0 ? Math.round((usedCents / limitCents) * 100) : usedCents > 0 ? 100 : 0,
    remainingCents,
    overCents: Math.max(0, -remainingCents),
    daysLeft,
    perDayCents: daysLeft > 0 && remainingCents > 0 ? Math.floor(remainingCents / daysLeft) : 0,
    level: allowanceLevel(usedCents, limitCents),
  };
}

/** Como fica a mesada depois de um gasto pessoal novo (para mostrar antes de lançar). */
export function allowanceAfter(state: AllowanceState, extraCents: number, month: string, today: IsoDate): AllowanceState {
  return allowanceState({ limitCents: state.limitCents, usedCents: state.usedCents + Math.max(0, extraCents), month, today });
}

/** O que o par enxerga: só a porcentagem. */
export function partnerAllowanceLabel(state: AllowanceState): string {
  if (state.level === "estourou") return `passou do combinado · ${state.percent}%`;
  return `usou ${state.percent}%`;
}

export const ALLOWANCE_LEVEL_LABEL: Record<AllowanceLevel, string> = {
  ok: "No caminho",
  perto: "Perto do limite",
  estourou: "Estourou",
};
