// Comentários e reações em lançamentos: regras puras (validação, resumo, não lidos, aviso ao par).
import { formatBRL } from "./money.ts";
import type { PushMessage } from "./notifications.ts";

/** Lista fechada de reações (a mesma do CHECK no banco). */
export const REACTIONS = ["👍", "❤️", "😬", "🤔", "✅"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const COMMENT_MAX = 500;

export const isReaction = (v: string): v is Reaction => (REACTIONS as readonly string[]).includes(v);

/** Texto pronto para gravar (sem espaços nas pontas) ou null se vazio/longo demais. */
export function normalizeComment(text: string): string | null {
  const t = text.trim();
  return t.length === 0 || t.length > COMMENT_MAX ? null : t;
}

/** Reações de um lançamento na ordem da lista, com contagem e se a minha está entre elas. */
export function summarizeReactions(rows: { emoji: string; userId: string | null }[], me: string): { emoji: Reaction; count: number; mine: boolean }[] {
  return REACTIONS.map((emoji) => {
    const of = rows.filter((r) => r.emoji === emoji);
    return { emoji, count: of.length, mine: of.some((r) => r.userId === me) };
  }).filter((r) => r.count > 0);
}

/** Tocar numa reação: a mesma tira, outra troca (uma por pessoa). */
export function toggleReaction(current: Reaction | null, tapped: Reaction): Reaction | null {
  return current === tapped ? null : tapped;
}

export interface ThreadSummary {
  comments: number;
  /** emojis distintos, na ordem da lista */
  reactions: Reaction[];
}

/** Contadores por lançamento (para o 💬 no item). */
export function threadSummaries(comments: { transactionId: string }[], reactions: { transactionId: string; emoji: string }[]): Record<string, ThreadSummary> {
  const out: Record<string, ThreadSummary> = {};
  const get = (id: string) => (out[id] ??= { comments: 0, reactions: [] });
  for (const c of comments) get(c.transactionId).comments++;
  for (const r of reactions) {
    const s = get(r.transactionId);
    if (isReaction(r.emoji) && !s.reactions.includes(r.emoji)) s.reactions.push(r.emoji);
  }
  for (const s of Object.values(out)) s.reactions.sort((a, b) => REACTIONS.indexOf(a) - REACTIONS.indexOf(b));
  return out;
}

// ───────────── não lidos (guardado no aparelho)

/** O que já vi: tudo até `floor`, e cada conversa aberta até o instante em que abri. Datas ISO. */
export interface SeenState {
  floor: string;
  tx: Record<string, string>;
}

/** Na primeira vez, considera não lido só o que chegou nos últimos 7 dias. */
export const FIRST_RUN_DAYS = 7;

export function initialSeen(nowIso: string): SeenState {
  return { floor: new Date(Date.parse(nowIso) - FIRST_RUN_DAYS * 86_400_000).toISOString(), tx: {} };
}

export function markThreadSeen(seen: SeenState, txId: string, nowIso: string): SeenState {
  return { floor: seen.floor, tx: { ...pruneSeen(seen).tx, [txId]: nowIso } };
}

export function markAllSeen(nowIso: string): SeenState {
  return { floor: nowIso, tx: {} };
}

/** Tira do mapa o que o `floor` já cobre (o mapa não cresce para sempre). */
export function pruneSeen(seen: SeenState): SeenState {
  const floor = Date.parse(seen.floor);
  return { floor: seen.floor, tx: Object.fromEntries(Object.entries(seen.tx).filter(([, at]) => Date.parse(at) > floor)) };
}

export interface CommentLite {
  id: string;
  transactionId: string;
  authorId: string | null;
  createdAt: string;
}

export interface UnreadThread<C extends CommentLite> {
  transactionId: string;
  count: number;
  /** o mais recente */
  latest: C;
}

/** Comentários do par que chegaram depois da última vez que vi (por conversa), mais recentes primeiro. */
export function unreadThreads<C extends CommentLite>(comments: C[], me: string, seen: SeenState): UnreadThread<C>[] {
  const floor = Date.parse(seen.floor);
  const map = new Map<string, UnreadThread<C>>();
  for (const c of comments) {
    if (c.authorId === me || c.authorId === null) continue;
    const at = Date.parse(c.createdAt);
    const txSeen = seen.tx[c.transactionId];
    if (at <= floor || (txSeen && at <= Date.parse(txSeen))) continue;
    const u = map.get(c.transactionId);
    if (!u) map.set(c.transactionId, { transactionId: c.transactionId, count: 1, latest: c });
    else {
      u.count++;
      if (at > Date.parse(u.latest.createdAt)) u.latest = c;
    }
  }
  return [...map.values()].sort((a, b) => Date.parse(b.latest.createdAt) - Date.parse(a.latest.createdAt));
}

// ───────────── aviso ao par

const ellipsis = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** "Ana comentou em iFood R$ 87,00" + o comentário. Tocar abre o Início (cartão de conversas novas). */
export function commentMessage(p: { byName: string; description: string; amountCents: number; body: string; txId: string }): PushMessage {
  return {
    title: `${p.byName} comentou em ${ellipsis(p.description, 40)} ${formatBRL(p.amountCents)}`,
    body: ellipsis(p.body.replace(/\s+/g, " ").trim(), 140),
    data: { type: "comment", route: "/", txId: p.txId },
  };
}
