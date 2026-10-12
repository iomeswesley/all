// Avisos depois que uma fatura é confirmada: alertas de orçamento (80%/100%) para o casal
// e um aviso ao par. Sem dependência de Deno/Supabase: o acesso a dados entra por `NotifyStore`.
import { alertKey, budgetAlertMessage, budgetStatuses, effectiveBudgets, hiddenTotalsToTx, importMessage, pendingAlerts } from "../_shared/core/index.ts";
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

  // Orçamento: gasto do mês = o que eu vejo + o gasto pessoal do par (só totais).
  const names = await store.memberNames();
  const hidden = (await store.hiddenTotals()).filter((h) => h.statementMonth === month);
  const txs = [...(await store.monthTransactions(month)), ...hiddenTotalsToTx(hidden, (id) => names[id] ?? "par")];
  const limits = effectiveBudgets(await store.budgetRows(), month);
  const statuses = budgetStatuses(limits, txs);
  const sent = await store.sentAlerts(month);
  const alerts = pendingAlerts(statuses, month, sent);

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

export { alertKey };
