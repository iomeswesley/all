// Aviso ao par quando alguém comenta num lançamento: "Ana comentou em iFood R$ 87,00".
// Sem dependência de Deno/Supabase: o acesso a dados entra por `CommentNotifyStore` (RLS de quem comentou).
import { commentMessage } from "../_shared/core/index.ts";
import type { PushMessage } from "../_shared/core/index.ts";
import type { NotifyStore, PushSender } from "./process.ts";

export interface CommentNotifyStore extends Pick<NotifyStore, "me" | "pushTokens" | "transaction"> {
  comment(id: string): Promise<{ id: string; authorId: string | null; transactionId: string; body: string; notifiedAt: string | null } | null>;
  /** marca o aviso como enviado (uma vez por comentário) */
  markCommentNotified(id: string): Promise<void>;
}

export type CommentOutcome = { status: "ok"; pushSent: number; partnerNotified: boolean } | { status: "not_found" } | { status: "already_notified" };

export async function notifyComment(store: CommentNotifyStore, sender: PushSender, commentId: string): Promise<CommentOutcome> {
  const me = await store.me();
  const c = await store.comment(commentId);
  // só quem escreveu dispara o aviso do próprio comentário
  if (!c || c.authorId !== me.userId) return { status: "not_found" };
  if (c.notifiedAt) return { status: "already_notified" };
  const tx = await store.transaction(c.transactionId);
  if (!tx) return { status: "not_found" };

  await store.markCommentNotified(c.id);
  // gasto pessoal: o par não enxerga o lançamento, então não há a quem avisar
  if (tx.isPrivate) return { status: "ok", pushSent: 0, partnerNotified: false };

  const m = commentMessage({ byName: me.displayName, description: tx.descriptionClean, amountCents: tx.amountCents, body: c.body, txId: tx.id });
  const messages: (PushMessage & { to: string })[] = (await store.pushTokens()).filter((t) => t.userId !== me.userId).map((t) => ({ ...m, to: t.token }));
  if (messages.length) await sender.send(messages);
  return { status: "ok", pushSent: messages.length, partnerNotified: messages.length > 0 };
}
