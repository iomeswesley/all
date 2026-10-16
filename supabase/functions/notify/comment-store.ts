import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommentNotifyStore } from "./comment.ts";
import { notifySupabaseStore } from "./supabase-store.ts";

export function commentSupabaseStore(db: SupabaseClient, userId: string): CommentNotifyStore {
  const base = notifySupabaseStore(db, userId);
  return {
    me: base.me,
    pushTokens: base.pushTokens,
    transaction: base.transaction,
    async comment(id) {
      const { data, error } = await db.from("tx_comments").select("id, author, transaction_id, body, notified_at").eq("id", id).limit(1);
      if (error) throw new Error(`tx_comments: ${error.message}`);
      const r = data?.[0];
      return r
        ? { id: r.id as string, authorId: (r.author as string | null) ?? null, transactionId: r.transaction_id as string, body: r.body as string, notifiedAt: (r.notified_at as string | null) ?? null }
        : null;
    },
    async markCommentNotified(id) {
      const { error } = await db.from("tx_comments").update({ notified_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(`tx_comments: ${error.message}`);
    },
  };
}
