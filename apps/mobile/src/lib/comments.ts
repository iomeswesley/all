import AsyncStorage from "@react-native-async-storage/async-storage";
import { initialSeen, markAllSeen, markThreadSeen, normalizeComment, pruneSeen, threadSummaries, type Reaction, type SeenState, type ThreadSummary } from "@financas/core";
import { supabase } from "./supabase";

export interface TxComment {
  id: string;
  transactionId: string;
  authorId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

export interface TxReaction {
  transactionId: string;
  userId: string | null;
  emoji: Reaction;
}

const COMMENT_COLUMNS = "id, transaction_id, author, body, created_at, edited_at";
const toComment = (r: Record<string, unknown>): TxComment => ({
  id: r.id as string,
  transactionId: r.transaction_id as string,
  authorId: (r.author as string | null) ?? null,
  body: r.body as string,
  createdAt: r.created_at as string,
  editedAt: (r.edited_at as string | null) ?? null,
});

/** Conversa de um lançamento (a RLS esconde o que é gasto pessoal do par). */
export async function fetchThread(txId: string): Promise<{ comments: TxComment[]; reactions: TxReaction[] }> {
  const [c, r] = await Promise.all([
    supabase.from("tx_comments").select(COMMENT_COLUMNS).eq("transaction_id", txId).order("created_at").throwOnError(),
    supabase.from("tx_reactions").select("transaction_id, user_id, emoji").eq("transaction_id", txId).throwOnError(),
  ]);
  return {
    comments: (c.data ?? []).map((x) => toComment(x as Record<string, unknown>)),
    reactions: (r.data ?? []).map((x) => ({ transactionId: x.transaction_id as string, userId: (x.user_id as string | null) ?? null, emoji: x.emoji as Reaction })),
  };
}

/** Contadores 💬 para uma lista de lançamentos (em lotes, para não estourar a URL). */
export async function fetchThreadSummaries(txIds: string[]): Promise<Record<string, ThreadSummary>> {
  const comments: { transactionId: string }[] = [];
  const reactions: { transactionId: string; emoji: string }[] = [];
  for (let i = 0; i < txIds.length; i += 80) {
    const ids = txIds.slice(i, i + 80);
    const [c, r] = await Promise.all([
      supabase.from("tx_comments").select("transaction_id").in("transaction_id", ids).throwOnError(),
      supabase.from("tx_reactions").select("transaction_id, emoji").in("transaction_id", ids).throwOnError(),
    ]);
    for (const x of c.data ?? []) comments.push({ transactionId: x.transaction_id as string });
    for (const x of r.data ?? []) reactions.push({ transactionId: x.transaction_id as string, emoji: x.emoji as string });
  }
  return threadSummaries(comments, reactions);
}

/** Avisa o par por push (melhor esforço: nunca desfaz o comentário). */
async function notifyComment(commentId: string): Promise<void> {
  try {
    await supabase.functions.invoke("notify", { body: { commentId } });
  } catch {
    // sem push (Expo Go, sem token): o par vê o selo "novo" no Início
  }
}

export async function addComment(householdId: string, txId: string, userId: string, text: string): Promise<TxComment> {
  const body = normalizeComment(text);
  if (!body) throw new Error("Escreva de 1 a 500 caracteres.");
  const { data } = await supabase
    .from("tx_comments")
    .insert({ household_id: householdId, transaction_id: txId, author: userId, body })
    .select(COMMENT_COLUMNS)
    .single()
    .throwOnError();
  const c = toComment(data as Record<string, unknown>);
  void notifyComment(c.id);
  return c;
}

export async function editComment(id: string, text: string): Promise<void> {
  const body = normalizeComment(text);
  if (!body) throw new Error("Escreva de 1 a 500 caracteres.");
  await supabase.from("tx_comments").update({ body }).eq("id", id).throwOnError();
}

export async function deleteComment(id: string): Promise<void> {
  await supabase.from("tx_comments").delete().eq("id", id).throwOnError();
}

/** Minha reação no lançamento: null tira; outra troca (uma por pessoa). */
export async function setReaction(householdId: string, txId: string, userId: string, emoji: Reaction | null): Promise<void> {
  if (emoji === null) {
    await supabase.from("tx_reactions").delete().eq("transaction_id", txId).eq("user_id", userId).throwOnError();
    return;
  }
  await supabase
    .from("tx_reactions")
    .upsert({ household_id: householdId, transaction_id: txId, user_id: userId, emoji }, { onConflict: "transaction_id,user_id" })
    .throwOnError();
}

// ───────────── não lidos (guardados só neste aparelho)

export interface InboxComment extends TxComment {
  description: string;
  amountCents: number;
}

const seenKey = (userId: string) => `comments.seen.${userId}`;

export async function loadSeen(userId: string): Promise<SeenState> {
  try {
    const raw = await AsyncStorage.getItem(seenKey(userId));
    if (raw) {
      const s = JSON.parse(raw) as SeenState;
      if (typeof s.floor === "string" && s.tx && typeof s.tx === "object") return s;
    }
  } catch {
    // armazenamento indisponível: começa do zero
  }
  const s = initialSeen(new Date().toISOString());
  await saveSeen(userId, s);
  return s;
}

async function saveSeen(userId: string, s: SeenState): Promise<void> {
  await AsyncStorage.setItem(seenKey(userId), JSON.stringify(pruneSeen(s))).catch(() => {});
}

export async function markSeen(userId: string, txId: string): Promise<void> {
  await saveSeen(userId, markThreadSeen(await loadSeen(userId), txId, new Date().toISOString()));
}

export async function markEverythingSeen(userId: string): Promise<void> {
  await saveSeen(userId, markAllSeen(new Date().toISOString()));
}

/** Comentários do par depois do piso do "já vi" (com o lançamento, para mostrar no Início). */
export async function fetchInbox(userId: string, since: string): Promise<InboxComment[]> {
  const { data } = await supabase
    .from("tx_comments")
    .select(`${COMMENT_COLUMNS}, transactions(description_clean, amount_cents)`)
    .neq("author", userId)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50)
    .throwOnError();
  return (data ?? []).map((x) => {
    const r = x as Record<string, unknown>;
    const t = (r.transactions ?? {}) as { description_clean?: string; amount_cents?: number };
    return { ...toComment(r), description: t.description_clean ?? "Lançamento", amountCents: Number(t.amount_cents ?? 0) };
  });
}
