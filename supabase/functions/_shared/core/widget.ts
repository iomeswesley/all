// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import type { AnalyticsTx } from "./analytics.ts";
import { formatBrDayMonth, formatMonthShort, type IsoDate } from "./dates.ts";
import { forecastMonths, type ForecastMonth } from "./forecast.ts";
import { formatBRL } from "./money.ts";
import { upcomingPlanned, type PlannedExpense, type PlannedOccurrence } from "./planned.ts";

/**
 * Payload do widget de tela inicial ("Previsto do mês" + próximo gasto futuro + atalho "+ Lançar").
 *
 * O widget nativo (iOS WidgetKit / Android App Widget) não roda a lógica do app: ele só desenha
 * textos prontos. Por isso tudo aqui já sai formatado e curto, e no modo privacidade nenhum valor
 * aparece (vira "••••"), igual à tela do app.
 */
export const WIDGET_MASK = "••••";
export const WIDGET_SCHEME_DEFAULT = "financascasal";
/** Tamanho máximo da descrição do próximo gasto (o widget pequeno não comporta mais). */
export const WIDGET_DESCRIPTION_MAX = 22;

export type WidgetState = "ready" | "empty" | "signedOut";

export interface WidgetNext {
  /** descrição curta ("IPVA", "Viagem para Flor…") */
  title: string;
  /** "20/10" */
  when: string;
  /** "R$ 1.200,00" ou "R$ ••••" */
  amount: string;
}

export interface WidgetPayload {
  /** versão do formato (o widget ignora payloads de versão desconhecida) */
  v: 1;
  state: WidgetState;
  /** "Previsto · out/26" */
  heading: string;
  /** "R$ 4.321,00", "R$ ••••" ou "—" */
  amount: string;
  /** "Média R$ 3.900,00 + planejado R$ 421,00", "Confirme uma fatura para prever" … */
  detail: string;
  next: WidgetNext | null;
  /** linha única para o widget pequeno: "Próximo: IPVA · 20/10 · R$ 1.200,00" */
  nextLine: string;
  actionLabel: string;
  /** deep link para lançar um gasto */
  actionUrl: string;
  /** deep link ao tocar no corpo do widget */
  openUrl: string;
  /** "Atualizado 16/10 14:05" */
  updatedLabel: string;
  privacy: boolean;
}

export interface WidgetInput {
  /** mês previsto a mostrar (o primeiro da previsão), ou null sem histórico */
  month: Pick<ForecastMonth, "monthKey" | "totalCents" | "baselineCents" | "plannedCents"> | null;
  /** próximo gasto futuro (já filtrado a partir de hoje), ou null */
  next: Pick<PlannedOccurrence, "description" | "amountCents" | "date"> | null;
  privacy: boolean;
  updatedAt: Date;
  /** scheme do app (app.json → expo.scheme) */
  scheme?: string;
}

const money = (cents: number, privacy: boolean): string => (privacy ? `${cents < 0 ? "-" : ""}R$ ${WIDGET_MASK}` : formatBRL(cents));

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Corta texto longo com reticências, sem deixar espaço antes delas. */
export function shortText(text: string, max = WIDGET_DESCRIPTION_MAX): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** "Atualizado 16/10 14:05" (hora local do aparelho). */
export function widgetUpdatedLabel(d: Date): string {
  return `Atualizado ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function widgetLinks(scheme = WIDGET_SCHEME_DEFAULT): { actionUrl: string; openUrl: string } {
  return { actionUrl: `${scheme}://lancar`, openUrl: `${scheme}://planejar` };
}

/** Monta o payload a partir do mês previsto e do próximo gasto futuro. */
export function buildWidgetPayload(input: WidgetInput): WidgetPayload {
  const { month, next, privacy } = input;
  const links = widgetLinks(input.scheme);
  const nextOut: WidgetNext | null = next ? { title: shortText(next.description), when: formatBrDayMonth(next.date), amount: money(next.amountCents, privacy) } : null;
  const base = {
    v: 1 as const,
    next: nextOut,
    nextLine: nextOut ? `Próximo: ${nextOut.title} · ${nextOut.when} · ${nextOut.amount}` : "Nenhum gasto futuro",
    actionLabel: "+ Lançar",
    ...links,
    updatedLabel: widgetUpdatedLabel(input.updatedAt),
    privacy,
  };
  if (!month) {
    return { ...base, state: "empty", heading: "Previsto do mês", amount: "—", detail: "Confirme uma fatura para prever" };
  }
  const detail = month.plannedCents > 0 ? `Média ${money(month.baselineCents, privacy)} + planejado ${money(month.plannedCents, privacy)}` : `Média dos últimos meses`;
  return { ...base, state: "ready", heading: `Previsto · ${formatMonthShort(month.monthKey)}`, amount: money(month.totalCents, privacy), detail };
}

export interface WidgetDataInput {
  txs: readonly AnalyticsTx[];
  /** último mês com fatura fechada; undefined/null = sem histórico */
  lastMonth: string | null | undefined;
  planned: readonly PlannedExpense[];
  today: IsoDate;
  privacy: boolean;
  updatedAt: Date;
  scheme?: string;
  /** quantos dias à frente procurar o próximo gasto futuro (padrão 180) */
  lookaheadDays?: number;
}

/** Atalho: calcula a previsão do mês (mesma regra do Início/Planejar) e monta o payload. */
export function widgetPayloadFromData(input: WidgetDataInput): WidgetPayload {
  const month = input.lastMonth ? forecastMonths({ txs: input.txs, lastMonth: input.lastMonth, planned: input.planned, today: input.today, horizon: 1 }).months[0] ?? null : null;
  const next = upcomingPlanned(input.planned, input.today, input.lookaheadDays ?? 180, 1)[0] ?? null;
  return buildWidgetPayload({ month, next, privacy: input.privacy, updatedAt: input.updatedAt, scheme: input.scheme });
}

/** Payload neutro para quando ninguém está logado (não deixa valores antigos na tela inicial). */
export function signedOutWidgetPayload(updatedAt: Date, scheme?: string): WidgetPayload {
  return {
    v: 1,
    state: "signedOut",
    heading: "Finanças do Casal",
    amount: "—",
    detail: "Entre no app para ver a previsão",
    next: null,
    nextLine: "",
    actionLabel: "Abrir",
    ...widgetLinks(scheme),
    updatedLabel: widgetUpdatedLabel(updatedAt),
    privacy: true,
  };
}

/** Lê um payload salvo (JSON) com segurança; devolve null se não for reconhecido. */
export function parseWidgetPayload(raw: string | null | undefined): WidgetPayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<WidgetPayload> | null;
    if (!p || p.v !== 1 || typeof p.amount !== "string" || typeof p.heading !== "string" || typeof p.actionUrl !== "string") return null;
    return p as WidgetPayload;
  } catch {
    return null;
  }
}
