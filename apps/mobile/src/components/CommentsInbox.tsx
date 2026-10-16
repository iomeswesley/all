import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { unreadThreads, type UnreadThread } from "@financas/core";
import { fetchInbox, loadSeen, markEverythingSeen, type InboxComment } from "@/lib/comments";
import { formatBRL } from "@/lib/format";
import { useReady } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";
import { TxThread, type ThreadTx } from "./TxThread";
import { Badge, Body, Card, Row, SectionTitle, Small } from "./ui";

/**
 * Início: conversas com comentários novos do par desde a última vez que você as abriu
 * ("já vi" guardado só neste aparelho). Funciona mesmo sem push (Expo Go).
 */
export function CommentsInbox() {
  const t = useTheme();
  const { me, members } = useReady();
  const [threads, setThreads] = useState<UnreadThread<InboxComment>[]>([]);
  const [open, setOpen] = useState<ThreadTx | null>(null);

  const load = useCallback(async () => {
    try {
      const seen = await loadSeen(me.user_id);
      setThreads(unreadThreads(await fetchInbox(me.user_id, seen.floor), me.user_id, seen));
    } catch {
      setThreads([]); // extra do Início: nunca atrapalha o resto da tela
    }
  }, [me.user_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (threads.length === 0 && !open) return null;
  const name = (uid: string | null) => members.find((m) => m.user_id === uid)?.display_name ?? "Seu par";
  const shown = threads.slice(0, 3);

  return (
    <>
      {threads.length > 0 ? (
        <Card style={{ paddingVertical: space.md, gap: space.xs }}>
          <SectionTitle
            right={
              <Pressable accessibilityRole="button" onPress={() => void markEverythingSeen(me.user_id).then(load)} hitSlop={8}>
                <Small style={{ color: t.primary, fontWeight: "600" }}>Marcar como lido</Small>
              </Pressable>
            }
          >
            💬 Conversas
          </SectionTitle>
          {shown.map((u, i) => (
            <Row key={u.transactionId} last={i === shown.length - 1} onPress={() => setOpen({ id: u.transactionId, description: u.latest.description, amountCents: u.latest.amountCents })}>
              <View style={{ flex: 1, gap: 2 }}>
                <Body numberOfLines={1} style={{ fontWeight: "600" }}>
                  {name(u.latest.authorId)} comentou em {u.latest.description} {formatBRL(u.latest.amountCents)}
                </Body>
                <Body muted numberOfLines={1} style={{ fontSize: 13 }}>{u.latest.body}</Body>
              </View>
              <Badge label={u.count > 1 ? `${u.count} novos` : "novo"} tone="warn" />
            </Row>
          ))}
          {threads.length > shown.length ? <Small>e mais {threads.length - shown.length} conversa(s)</Small> : null}
        </Card>
      ) : null}
      <TxThread tx={open} onClose={() => { setOpen(null); void load(); }} />
    </>
  );
}
