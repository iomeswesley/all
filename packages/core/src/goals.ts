import { addMonths, diffDays, splitIso, type IsoDate } from "./dates.ts";

export interface GoalInput {
  targetCents: number;
  savedCents: number;
  dueDate: IsoDate | null;
}

export type GoalStatus = "concluida" | "no_prazo" | "atrasada" | "sem_prazo";

export interface GoalProgress {
  percent: number;
  remainingCents: number;
  monthsLeft: number | null;
  /** quanto guardar por mês para chegar no prazo */
  monthlyNeededCents: number | null;
  status: GoalStatus;
}

const monthsBetween = (from: IsoDate, to: IsoDate): number => {
  const a = splitIso(from);
  const b = splitIso(to);
  return (b.y - a.y) * 12 + (b.m - a.m);
};

export function goalProgress(goal: GoalInput, today: IsoDate): GoalProgress {
  const remaining = Math.max(goal.targetCents - goal.savedCents, 0);
  const percent = goal.targetCents > 0 ? Math.round((goal.savedCents / goal.targetCents) * 100) : 0;
  if (remaining === 0) return { percent, remainingCents: 0, monthsLeft: null, monthlyNeededCents: 0, status: "concluida" };
  if (!goal.dueDate) return { percent, remainingCents: remaining, monthsLeft: null, monthlyNeededCents: null, status: "sem_prazo" };
  if (goal.dueDate <= today) return { percent, remainingCents: remaining, monthsLeft: 0, monthlyNeededCents: remaining, status: "atrasada" };
  const months = Math.max(monthsBetween(today, goal.dueDate), 1);
  return { percent, remainingCents: remaining, monthsLeft: months, monthlyNeededCents: Math.ceil(remaining / months), status: "no_prazo" };
}

/** Cabe no que sobra por mês? */
export function goalFeasibility(monthlyNeededCents: number | null, monthlySurplusCents: number | null): "cabe" | "apertado" | "nao_cabe" | "desconhecido" {
  if (monthlyNeededCents === null || monthlySurplusCents === null) return "desconhecido";
  if (monthlyNeededCents <= monthlySurplusCents * 0.7) return "cabe";
  if (monthlyNeededCents <= monthlySurplusCents) return "apertado";
  return "nao_cabe";
}

export { addMonths, diffDays };
