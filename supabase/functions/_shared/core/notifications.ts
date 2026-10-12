// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { categoryName } from "./categories.ts";
import { formatMonthShort } from "./dates.ts";
import { formatBRL } from "./money.ts";
import type { BudgetAlert } from "./budget.ts";

export interface PushMessage {
  title: string;
  body: string;
  /** o app abre esta rota ao tocar */
  data: { type: "budget" | "import"; route: string; month?: string; categoryId?: number };
}

export function budgetAlertMessage(a: BudgetAlert): PushMessage {
  const s = a.status;
  const cat = categoryName(a.categoryId);
  const when = formatMonthShort(a.month);
  if (a.level === "over100") {
    return {
      title: `Orçamento estourado: ${cat}`,
      body: `${formatBRL(s.spentCents)} de ${formatBRL(s.limitCents)} (${s.percent}%) na fatura de ${when}.`,
      data: { type: "budget", route: "/orcamento", month: a.month, categoryId: a.categoryId },
    };
  }
  return {
    title: `${cat} chegou a ${s.percent}% do orçamento`,
    body: `${formatBRL(s.spentCents)} de ${formatBRL(s.limitCents)}; restam ${formatBRL(s.remainingCents)} na fatura de ${when}.`,
    data: { type: "budget", route: "/orcamento", month: a.month, categoryId: a.categoryId },
  };
}

export function importMessage(p: { byName: string; month: string; count: number; reviewCount: number }): PushMessage {
  const review = p.reviewCount > 0 ? ` ${p.reviewCount} para revisar.` : " Tudo categorizado.";
  return {
    title: `${p.byName} confirmou a fatura de ${formatMonthShort(p.month)}`,
    body: `${p.count} lançamentos.${review}`,
    data: { type: "import", route: p.reviewCount > 0 ? "/revisar" : "/", month: p.month },
  };
}
