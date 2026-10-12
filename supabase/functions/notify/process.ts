// Avisos depois que uma fatura é confirmada: alertas de orçamento (80%/100%) para o casal
// e um aviso ao par. Sem dependência de Deno/Supabase: o acesso a dados entra por `NotifyStore`.
import { alertKey, budgetAlertMessage, budgetStatuses, effectiveBudgets, hiddenTotalsToTx, importMessage, manualEntryMessage, pendingAlerts } from "../_shared/core/index.ts";
import type { AnalyticsTx, BudgetAlert, BudgetRow, HiddenTotal, PushMessage } from "../_shared/core/index.ts";

export interface NotifyStore {
  me(): Promise<{ userId: string; householdId: string; displayName: string }>;
  statement(id: string): Promise<{ id: string; status: string; dueDate: string } | null>;
  /** Lançamentos visíveis ao usuário na competência (faturas confirmadas). */
  monthTransactions(month: string): Promise<AnalyticsTx[]>;
  /** Gasto pessoal do par, só totais por categoria/mês. */
  hiddenTotals(): Promise<HiddenTotal[]>;
  memberNames(): Promise<Record<string, string>>;
  budgetRows(): Promise<BudgetRow[]>;
  sentAlerts(month: string): Promise<Set<string>>;
  markAlerts(alerts: BudgetAlert[]): Promise<void>;
  pushTokens(): Promise<{ userId: string; token: string }[]>;
  statementCounts(statementId: string): Promise<{ count: number; reviewCount: number }>;
  /** Lançamento visível ao usuário (para o aviso de lançamento manual). */
  transaction(id: string): Promise<{ id: string; postedOn: string; descriptionClean: string; amountCents: number; categoryId: number | null; needsReview: boolean; isPrivate: boolean; source: string } | null>;
}

export interface PushSender {
  send(messages: (PushMessage & { to: string })[]): Promise<void>;
}

export interface NotifyResult {
  month: string;
  /** alertas novos (também mostrados no app, mesmo sem push) */
  alerts: { categoryId: number; level: "warn80" | "over100"; percent: number; title: string; body: string }[];
  pushSent: number;
  partnerNotified: boolean;
}

export type NotifyOutcome = ({ status: "ok" } & NotifyResult) | { status: "not_confirmed" } | { status: "not_found" };

export async function notifyStatementConfirmed(store: NotifyStore, sender: PushSender, statementId: string): Promise<NotifyOutcome> {
  const st = await store.statement(statementId);
  if (!st) return { status: "not_found" };
  if (st.status !== "confirmed") return { status: "not_confirmed" };

  const me = await store.me();
  const month = st.dueDate.slice(0, 7);

  const alerts = await evaluateBudgets(store, month);

  const tokens = await store.pushTokens();
  const messages: (PushMessage & { to: string })[] = [];
  const alertMessages = alerts.map((a) => ({ a, m: budgetAlertMessage(a) }));
  for (const { m } of alertMessages) for (const t of tokens) messages.push({ ...m, to: t.token }); // orçamento é do casal: os dois recebem

  // Aviso ao par (não a quem confirmou).
  const partnerTokens = tokens.filter((t) => t.userId !== me.userId);
  const counts = await store.statementCounts(statementId);
  for (const t of partnerTokens) messages.push({ ...importMessage({ byName: me.displayName, month, count: counts.count, reviewCount: counts.reviewCount }), to: t.token });

  if (alerts.length) await store.markAlerts(alerts);
  if (messages.length) await sender.send(messages);

  return {
    status: "ok",
    month,
    alerts: alertMessages.map(({ a, m }) => ({ categoryId: a.categoryId, level: a.level, percent: a.status.percent, title: m.title, body: m.body })),
    pushSent: messages.length,
    partnerNotified: partnerTokens.length > 0,
  };
}

/**
 * Orçamento do mês: o que eu vejo + o gasto pessoal do par (só totais). Devolve os alertas ainda não enviados
 * e já os marca como enviados.
 */
async function evaluateBudgets(store: NotifyStore, month: string): Promise<BudgetAlert[]> {
  const names = await store.memberNames();
  const hidden = (await store.hiddenTotals()).filter((h) => h.statementMonth === month);
  const txs = [...(await store.monthTransactions(month)), ...hiddenTotalsToTx(hidden, (id) => names[id] ?? "par")];
  const limits = effectiveBudgets(await store.budgetRows(), month);
  const alerts = pendingAlerts(budgetStatuses(limits, txs), month, await store.sentAlerts(month));
  return alerts;
}

export type ManualOutcome = ({ status: "ok" } & NotifyResult) | { status: "not_found" };

/** Depois de um lançamento manual: reavalia o orçamento na hora e avisa o par (sem expor gasto pessoal). */
export async function notifyManualEntry(store: NotifyStore, sender: PushSender, txId: string): Promise<ManualOutcome> {
  const tx = await store.transaction(txId);
  if (!tx || tx.source !== "manual") return { status: "not_found" };
  const me = await store.me();
  const month = tx.postedOn.slice(0, 7);
  const alerts = await evaluateBudgets(store, month);

  const tokens = await store.pushTokens();
  const messages: (PushMessage & { to: string })[] = [];
  const alertMessages = alerts.map((a) => ({ a, m: budgetAlertMessage(a) }));
  for (const { m } of alertMessages) for (const t of tokens) messages.push({ ...m, to: t.token });

  const partnerTokens = tokens.filter((t) => t.userId !== me.userId);
  if (!tx.isPrivate) {
    const m = manualEntryMessage({ byName: me.displayName, amountCents: tx.amountCents, description: tx.descriptionClean, categoryId: tx.categoryId, needsReview: tx.needsReview, month, txId });
    for (const t of partnerTokens) messages.push({ ...m, to: t.token });
  }

  if (alerts.length) await store.markAlerts(alerts);
  if (messages.length) await sender.send(messages);
  return {
    status: "ok",
    month,
    alerts: alertMessages.map(({ a, m }) => ({ categoryId: a.categoryId, level: a.level, percent: a.status.percent, title: m.title, body: m.body })),
    pushSent: messages.length,
    partnerNotified: !tx.isPrivate && partnerTokens.length > 0,
  };
}

export { alertKey };
