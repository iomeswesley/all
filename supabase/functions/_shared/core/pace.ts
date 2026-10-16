// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { spending, type AnalyticsTx } from "./analytics.ts";
import { CAT } from "./categories.ts";
import { addMonthsToKey, daysInMonth, diffDays, isoDate, monthKey, splitIso, type IsoDate } from "./dates.ts";

/**
 * Ritmo de gasto do mês corrente ("no ritmo atual, o mês fecha em R$ X").
 *
 * Sem Open Finance o cartão só chega quando a fatura fecha (competência = mês do vencimento),
 * então durante o mês só existem os lançamentos manuais (Pix, dinheiro…). A projeção é honesta:
 *   fecha(mês) = manuais até hoje ÷ dias decorridos × dias do mês   ("Pix até hoje × ritmo")
 *              + cartão: fatura do mês, se já confirmada; senão a média dos últimos meses com cartão.
 * Nos primeiros dias o ritmo linear exagera (um mercado no dia 1 viraria 30 mercados), então até
 * `PACE_MIN_DAYS` usa-se o maior entre o já lançado e a média dos manuais dos meses anteriores.
 */
export const PACE_MIN_DAYS = 5;

export type PaceLevel = "dentro" | "perto" | "estoura";

export const PACE_LEVEL_LABEL: Record<PaceLevel, string> = { dentro: "Dentro", perto: "Perto", estoura: "Vai estourar" };

/** De onde vem a parte do cartão. */
export type PaceCardSource = "fatura" | "media" | "nenhum";

export interface PaceInput {
  txs: readonly AnalyticsTx[];
  /** true para lançamento manual (Pix, dinheiro…); o resto é cartão/fatura */
  isManual: (t: AnalyticsTx) => boolean;
  today: IsoDate;
  /** competência projetada (padrão: mês de `today`) */
  month?: string;
  /** a fatura do cartão deste mês já foi confirmada? (padrão: existe lançamento de cartão no mês) */
  cardConfirmed?: boolean;
  /** limites efetivos do mês (`effectiveBudgets(rows, month)`) */
  limits?: ReadonlyMap<number, number>;
  /** meses de histórico nas médias (padrão 6) */
  window?: number;
}

export interface CategoryPace {
  categoryId: number;
  /** já aconteceu no mês (manuais + fatura, se confirmada) */
  spentCents: number;
  manualSoFarCents: number;
  manualProjectedCents: number;
  cardCents: number;
  projectedCents: number;
  /** null = sem limite */
  limitCents: number | null;
  /** projetado / limite, em % (null sem limite) */
  percent: number | null;
  level: PaceLevel | null;
  /** já passou do limite com o que aconteceu */
  alreadyOver: boolean;
  /** dia aproximado em que estoura (null se não estoura ou já estourou) */
  overDay: number | null;
}

export interface Pace {
  month: string;
  /** dias decorridos, contando hoje (1..dias do mês) */
  day: number;
  daysInMonth: number;
  /** poucos dias para um ritmo confiável: usa a média dos manuais */
  early: boolean;
  manualSoFarCents: number;
  manualProjectedCents: number;
  cardCents: number;
  cardSource: PaceCardSource;
  /** meses que entraram na média do cartão */
  cardBasisMonths: number;
  spentCents: number;
  projectedCents: number;
  /** fórmula em uma linha, para a tela */
  formula: string;
  /** categorias com limite ou com projeção ≠ 0. Ordem: estoura, perto, dentro, sem limite; depois por valor */
  categories: CategoryPace[];
  over: number;
  near: number;
}

const add = (m: Map<number, number>, id: number, v: number) => m.set(id, (m.get(id) ?? 0) + v);
const catOf = (t: AnalyticsTx) => t.categoryId ?? CAT.OUTROS;

/** Média por categoria (arredondada por categoria) dos meses anteriores que têm dados do tipo pedido. */
function averageByCategory(txs: readonly AnalyticsTx[], months: ReadonlySet<string>): { avg: Map<number, number>; basis: number } {
  const sums = new Map<number, number>();
  const seen = new Set<string>();
  for (const t of txs) {
    if (!months.has(t.statementMonth)) continue;
    seen.add(t.statementMonth);
    add(sums, catOf(t), t.amountCents);
  }
  const avg = new Map<number, number>();
  if (seen.size > 0) for (const [id, s] of sums) avg.set(id, Math.round(s / seen.size));
  return { avg, basis: seen.size };
}

export function paceLevel(projectedCents: number, limitCents: number): PaceLevel {
  // inteiros, como em `levelOf`: ≥ 100% estoura, ≥ 80% perto
  if (projectedCents >= limitCents) return "estoura";
  if (projectedCents * 100 >= limitCents * 80) return "perto";
  return "dentro";
}

/**
 * Dia aproximado em que o gasto cruza o limite, supondo que o que falta acontecer
 * (projetado − já gasto) se espalha igualmente pelos dias restantes.
 */
export function overrunDay(spentCents: number, projectedCents: number, limitCents: number, day: number, dim: number): number | null {
  if (spentCents >= limitCents || projectedCents < limitCents || day >= dim) return null;
  const rest = dim - day;
  const perDay = (projectedCents - spentCents) / rest;
  if (perDay <= 0) return null;
  return Math.min(dim, day + Math.max(1, Math.ceil((limitCents - spentCents) / perDay)));
}

export function paceFormula(p: Pick<Pace, "early" | "cardSource" | "cardBasisMonths">): string {
  const manual = p.early ? "Pix médio" : "Pix até hoje × ritmo";
  if (p.cardSource === "fatura") return `${manual} + fatura do mês`;
  if (p.cardSource === "media") return `${manual} + cartão médio${p.cardBasisMonths > 1 ? ` (${p.cardBasisMonths}m)` : ""}`;
  return manual;
}

export function computePace(input: PaceInput): Pace {
  const today = input.today;
  const month = input.month ?? monthKey(today);
  const window = input.window ?? 6;
  const { y, m } = splitIso(`${month}-01`);
  const dim = daysInMonth(y, m);
  const first = isoDate(y, m, 1);
  const day = Math.min(dim, Math.max(1, diffDays(today, first) + 1));
  const early = day < PACE_MIN_DAYS;

  const txs = spending(input.txs);
  const manual: AnalyticsTx[] = [];
  const card: AnalyticsTx[] = [];
  for (const t of txs) (input.isManual(t) ? manual : card).push(t);

  const past = new Set(Array.from({ length: window }, (_, i) => addMonthsToKey(month, -(i + 1))));

  // manuais do mês
  const manualSoFar = new Map<number, number>();
  for (const t of manual) if (t.statementMonth === month) add(manualSoFar, catOf(t), t.amountCents);
  const manualAvg = early ? averageByCategory(manual, past).avg : new Map<number, number>();

  // cartão
  const cardMonth = card.filter((t) => t.statementMonth === month);
  const confirmed = input.cardConfirmed ?? cardMonth.length > 0;
  const cardByCat = new Map<number, number>();
  let cardSource: PaceCardSource;
  let cardBasisMonths = 0;
  if (confirmed) {
    for (const t of cardMonth) add(cardByCat, catOf(t), t.amountCents);
    cardSource = "fatura";
  } else {
    const { avg, basis } = averageByCategory(card, past);
    for (const [id, v] of avg) cardByCat.set(id, v);
    cardBasisMonths = basis;
    cardSource = basis > 0 ? "media" : "nenhum";
  }

  const limits = input.limits ?? new Map<number, number>();
  const ids = new Set<number>([...manualSoFar.keys(), ...manualAvg.keys(), ...cardByCat.keys(), ...[...limits].filter(([, l]) => l > 0).map(([id]) => id)]);
  const categories: CategoryPace[] = [];
  for (const id of ids) {
    const soFar = manualSoFar.get(id) ?? 0;
    const linear = Math.round((soFar / day) * dim);
    const manualProjected = early ? Math.max(soFar, manualAvg.get(id) ?? 0) : linear;
    const cardCents = cardByCat.get(id) ?? 0;
    const spent = soFar + (confirmed ? cardCents : 0);
    const projected = manualProjected + cardCents;
    const limit = limits.get(id);
    const hasLimit = limit !== undefined && limit > 0;
    if (!hasLimit && projected === 0 && spent === 0) continue;
    const level = hasLimit ? paceLevel(Math.max(projected, 0), limit) : null;
    categories.push({
      categoryId: id,
      spentCents: spent,
      manualSoFarCents: soFar,
      manualProjectedCents: manualProjected,
      cardCents,
      projectedCents: projected,
      limitCents: hasLimit ? limit : null,
      percent: hasLimit ? Math.round((Math.max(projected, 0) / limit) * 100) : null,
      level,
      alreadyOver: hasLimit && spent >= limit,
      overDay: hasLimit ? overrunDay(spent, projected, limit, day, dim) : null,
    });
  }
  const rank = (c: CategoryPace) => (c.level === "estoura" ? 0 : c.level === "perto" ? 1 : c.level === "dentro" ? 2 : 3);
  categories.sort((a, b) => rank(a) - rank(b) || b.projectedCents - a.projectedCents || a.categoryId - b.categoryId);

  const sum = (f: (c: CategoryPace) => number) => categories.reduce((a, c) => a + f(c), 0);
  const base = { early, cardSource, cardBasisMonths };
  return {
    month,
    day,
    daysInMonth: dim,
    early,
    manualSoFarCents: sum((c) => c.manualSoFarCents),
    manualProjectedCents: sum((c) => c.manualProjectedCents),
    cardCents: sum((c) => c.cardCents),
    cardSource,
    cardBasisMonths,
    spentCents: sum((c) => c.spentCents),
    projectedCents: sum((c) => c.projectedCents),
    formula: paceFormula(base),
    categories,
    over: categories.filter((c) => c.level === "estoura").length,
    near: categories.filter((c) => c.level === "perto").length,
  };
}

/** Texto curto do status de uma categoria com limite: "Dentro", "Perto", "Vai estourar ~dia 22", "Estourou". */
export function paceStatusLabel(c: Pick<CategoryPace, "level" | "alreadyOver" | "overDay">): string | null {
  if (!c.level) return null;
  if (c.alreadyOver) return "Estourou";
  if (c.level === "estoura") return c.overDay ? `Vai estourar ~dia ${c.overDay}` : "Vai estourar";
  return PACE_LEVEL_LABEL[c.level];
}
