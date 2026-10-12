import { compareMonths, spending, totalByCategory, totalSpent, type AnalyticsTx, type Change } from "./analytics.ts";
import { budgetStatuses, type BudgetStatus } from "./budget.ts";
import { avoidableCharges, type AnnuityInfo, type AvoidableCharges } from "./charges.ts";
import { CAT, categoryName } from "./categories.ts";
import { addMonthsToKey, formatMonthLong, formatMonthShort } from "./dates.ts";
import { formatBRL } from "./money.ts";
import { decodeDescription } from "./normalize.ts";
import { detectRecurring, type RecurringReport } from "./recurring.ts";

export type CheckinTx = AnalyticsTx & { amountUsdCents?: number | null };

export type RecommendationKind = "duplicada" | "orcamento" | "categoria_acima" | "juros" | "iof" | "anuidade" | "delivery";

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  detail: string;
  /** economia estimada em centavos por mês */
  savingsCentsPerMonth: number;
  /** True quando o valor é uma estimativa/teto, não um valor cobrado */
  estimate: boolean;
}

export interface Checkin {
  month: string;
  totalCents: number;
  prevTotalCents: number | null;
  deltaCents: number | null;
  deltaPercent: number | null;
  risers: Change[];
  fallers: Change[];
  newMerchants: Change[];
  budgets: BudgetStatus[];
  recurring: RecurringReport;
  charges: AvoidableCharges;
  recommendations: Recommendation[];
  estimatedSavingsCents: number;
  /** Texto pronto para compartilhar */
  text: string;
}

export interface CheckinInput {
  month: string;
  /** todas as competências disponíveis (inclui as anteriores) */
  txs: readonly CheckinTx[];
  /** limites vigentes no mês (categoria → centavos) */
  budgets?: ReadonlyMap<number, number>;
  annuity?: AnnuityInfo | null;
}

const MIN_EXCESS_CENTS = 5000; // R$ 50
const MIN_DELIVERY_CENTS = 15000; // R$ 150
const DELIVERY_REDUCTION = 0.25; // estimativa: cortar 1/4 do delivery
const MIN_IOF_CENTS = 1000; // R$ 10

export function buildCheckin(input: CheckinInput): Checkin {
  const { month } = input;
  const prevMonth = addMonthsToKey(month, -1);
  const real = input.txs.filter((t) => !t.hiddenAggregate);
  const cur = input.txs.filter((t) => t.statementMonth === month);
  const prev = input.txs.filter((t) => t.statementMonth === prevMonth);
  const total = totalSpent(cur);
  const hasPrev = prev.length > 0;
  const prevTotal = hasPrev ? totalSpent(prev) : null;

  const catChanges = compareMonths(cur, prev, "category", categoryName);
  const merchantChanges = compareMonths(cur, prev, "merchant");
  const risers = hasPrev ? catChanges.filter((c) => c.diffCents > 0).slice(0, 3) : [];
  const fallers = hasPrev ? catChanges.filter((c) => c.diffCents < 0).slice(0, 3) : [];
  const newMerchants = hasPrev ? merchantChanges.filter((c) => c.status === "novo").sort((a, b) => b.currentCents - a.currentCents).slice(0, 5) : [];

  const limits = input.budgets ?? new Map<number, number>();
  const budgets = budgetStatuses(limits, cur);
  const recurring = detectRecurring(real, month);
  const charges = avoidableCharges(
    real.filter((t) => t.statementMonth === month),
    input.annuity,
  );

  const recs: Recommendation[] = [];

  // 1) assinaturas cobradas em duplicidade
  for (const r of recurring.items) {
    if (r.active && r.alerts.includes("duplicada")) {
      recs.push({
        id: `dup:${r.key}`, kind: "duplicada", estimate: false,
        title: `${r.label}: cobrança em duplicidade`,
        detail: `Foi cobrada mais de uma vez em ${formatMonthLong(month)}. Se for engano, cancele a extra ou conteste.`,
        savingsCentsPerMonth: r.typicalCents,
      });
    }
  }

  // 2) orçamento estourado
  const overBudget = new Set<number>();
  for (const b of budgets) {
    if (b.level === "over100") {
      overBudget.add(b.categoryId);
      recs.push({
        id: `orc:${b.categoryId}`, kind: "orcamento", estimate: false,
        title: `${categoryName(b.categoryId)} passou do orçamento`,
        detail: `Gasto ${formatBRL(b.spentCents)} para um limite de ${formatBRL(b.limitCents)} (${b.percent}%).`,
        savingsCentsPerMonth: b.spentCents - b.limitCents,
      });
    }
  }

  // 3) categoria bem acima da média dos 3 meses anteriores
  const prior = [1, 2, 3].map((n) => addMonthsToKey(month, -n)).map((m) => totalByCategory(input.txs.filter((t) => t.statementMonth === m)));
  const priorMonthsWithData = prior.filter((p) => p.length > 0).length;
  if (priorMonthsWithData >= 2) {
    for (const c of totalByCategory(cur)) {
      if (c.categoryId === CAT.OUTROS || overBudget.has(c.categoryId)) continue;
      const avg = Math.round(prior.reduce((a, p) => a + (p.find((x) => x.categoryId === c.categoryId)?.totalCents ?? 0), 0) / priorMonthsWithData);
      const excess = c.totalCents - avg;
      if (avg > 0 && excess >= MIN_EXCESS_CENTS && c.totalCents >= avg * 1.2) {
        recs.push({
          id: `cat:${c.categoryId}`, kind: "categoria_acima", estimate: true,
          title: `${categoryName(c.categoryId)} acima da sua média`,
          detail: `${formatBRL(c.totalCents)} neste mês contra média de ${formatBRL(avg)} nos ${priorMonthsWithData} meses anteriores. Voltar à média economiza o excesso.`,
          savingsCentsPerMonth: excess,
        });
      }
    }
  }

  // 4) juros, multa e mora: 100% evitáveis
  if (charges.lateCents > 0) {
    recs.push({
      id: "late", kind: "juros", estimate: false,
      title: "Juros/multa por atraso nesta fatura",
      detail: "Pagar o total até o vencimento elimina esse custo. Considere débito automático do valor total.",
      savingsCentsPerMonth: charges.lateCents,
    });
  }

  // 5) IOF em compras no exterior
  if (charges.iofCents >= MIN_IOF_CENTS) {
    recs.push({
      id: "iof", kind: "iof", estimate: true,
      title: "IOF em compras no exterior",
      detail: `Você pagou ${formatBRL(charges.iofCents)} de IOF. Veja se algum serviço em dólar tem plano em reais ou se dá para concentrar/cancelar.`,
      savingsCentsPerMonth: charges.iofCents,
    });
  }

  // 6) anuidade
  if (charges.annuity && !charges.annuity.waived) {
    recs.push({
      id: "anuidade", kind: "anuidade", estimate: false,
      title: "Anuidade do cartão sendo cobrada",
      detail: `Você pagou ${formatBRL(charges.annuity.paidCents)} nesta fatura. Peça isenção ou veja a condição de gasto mínimo/salário na conta.`,
      savingsCentsPerMonth: charges.annuity.paidCents,
    });
  }

  // 7) delivery
  const delivery = spending(cur).filter((t) => !t.hiddenAggregate && decodeDescription(t.descriptionRaw).processor?.name === "iFood");
  const deliveryTotal = delivery.reduce((a, t) => a + t.amountCents, 0);
  if (deliveryTotal >= MIN_DELIVERY_CENTS) {
    recs.push({
      id: "delivery", kind: "delivery", estimate: true,
      title: "Delivery pelo iFood",
      detail: `${delivery.length} pedidos somaram ${formatBRL(deliveryTotal)}. Cortar 1 em cada 4 já faz diferença (estimativa).`,
      savingsCentsPerMonth: Math.round(deliveryTotal * DELIVERY_REDUCTION),
    });
  }

  const recommendations = recs.filter((r) => r.savingsCentsPerMonth > 0).sort((a, b) => b.savingsCentsPerMonth - a.savingsCentsPerMonth).slice(0, 5);
  const estimatedSavingsCents = recommendations.reduce((a, r) => a + r.savingsCentsPerMonth, 0);

  const checkin: Omit<Checkin, "text"> = {
    month, totalCents: total, prevTotalCents: prevTotal,
    deltaCents: prevTotal === null ? null : total - prevTotal,
    deltaPercent: prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
    risers, fallers, newMerchants, budgets, recurring, charges, recommendations, estimatedSavingsCents,
  };
  return { ...checkin, text: checkinText(checkin) };
}

function checkinText(c: Omit<Checkin, "text">): string {
  const L: string[] = [];
  L.push(`Check-in — fatura de ${formatMonthLong(c.month)}`);
  L.push(`Total: ${formatBRL(c.totalCents)}`);
  if (c.deltaCents !== null) {
    const pct = c.deltaPercent === null ? "" : ` (${c.deltaPercent > 0 ? "+" : ""}${c.deltaPercent}%)`;
    L.push(`Vs ${formatMonthShort(prevKey(c.month))}: ${c.deltaCents > 0 ? "+" : ""}${formatBRL(c.deltaCents)}${pct}`);
  }
  if (c.risers.length) L.push("", "Subiram:", ...c.risers.map((r) => `• ${r.label}: +${formatBRL(r.diffCents)}`));
  if (c.fallers.length) L.push("", "Caíram:", ...c.fallers.map((r) => `• ${r.label}: ${formatBRL(r.diffCents)}`));
  if (c.newMerchants.length) L.push("", "Novos estabelecimentos:", ...c.newMerchants.map((r) => `• ${r.label}: ${formatBRL(r.currentCents)}`));
  const over = c.budgets.filter((b) => b.level !== "ok");
  if (over.length) L.push("", "Orçamento:", ...over.map((b) => `• ${categoryName(b.categoryId)}: ${b.percent}% (${formatBRL(b.spentCents)} de ${formatBRL(b.limitCents)})`));
  if (c.charges.totalCents > 0) L.push("", `Encargos: ${formatBRL(c.charges.totalCents)}${c.charges.lateCents > 0 ? ` (juros/multa: ${formatBRL(c.charges.lateCents)})` : ""}`);
  if (c.recommendations.length) {
    L.push("", "Recomendações:");
    c.recommendations.forEach((r, i) => L.push(`${i + 1}. ${r.title} — economia ${r.estimate ? "estimada " : ""}de ${formatBRL(r.savingsCentsPerMonth)}/mês`));
    L.push(`Potencial: ${formatBRL(c.estimatedSavingsCents)}/mês`);
  }
  return L.join("\n");
}

const prevKey = (m: string) => addMonthsToKey(m, -1);
