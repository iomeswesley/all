import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COMMENT_MAX, REACTIONS, summarizeReactions, toggleReaction, type Reaction, type ThreadSummary } from "@financas/core";
import { addComment, deleteComment, editComment, fetchThread, fetchThreadSummaries, markSeen, setReaction, type TxComment, type TxReaction } from "@/lib/comments";
import { formatBRL } from "@/lib/format";
import { useReady } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";
import { Body, ErrorText, Small } from "./ui";

/** O mínimo do lançamento que a conversa precisa mostrar no topo. */
export interface ThreadTx {
  id: string;
  description: string;
  amountCents: number;
  isPrivate?: boolean;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return hm;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hm}`;
}

/**
 * Conversa de um lançamento (estilo Honeydue): barra de reações, comentários e campo para escrever.
 * Toque longo no próprio comentário para editar ou apagar.
 */
export function TxThread({ tx, onClose, onChanged }: { tx: ThreadTx | null; onClose: () => void; onChanged?: () => void }) {
  const t = useTheme();
  const { me, members, householdId, partner } = useReady();
  const [data, setData] = useState<{ comments: TxComment[]; reactions: TxReaction[] } | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<TxComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const txId = tx?.id ?? null;

  const load = useCallback(async (id: string) => {
    try {
      setData(await fetchThread(id));
      setFail(null);
    } catch (e) {
      setFail((e as Error).message);
    }
  }, []);

  // outro lançamento: começa a conversa do zero (ajuste durante o render, sem efeito em cascata)
  const [shownId, setShownId] = useState<string | null>(null);
  if (txId !== shownId) {
    setShownId(txId);
    setData(null);
    setText("");
    setEditing(null);
    setFail(null);
  }

  useEffect(() => {
    if (!txId) return;
    let alive = true;
    fetchThread(txId).then(
      (d) => { if (alive) setData(d); },
      (e: Error) => { if (alive) setFail(e.message); },
    );
    void markSeen(me.user_id, txId);
    return () => { alive = false; };
  }, [txId, me.user_id]);

  const reactions = useMemo(() => summarizeReactions(data?.reactions ?? [], me.user_id), [data, me.user_id]);
  const mine = (data?.reactions ?? []).find((r) => r.userId === me.user_id)?.emoji ?? null;
  const name = (uid: string | null) => (uid === me.user_id ? "Você" : members.find((m) => m.user_id === uid)?.display_name ?? "Ex-membro");

  async function run(fn: () => Promise<void>) {
    if (!txId) return;
    setBusy(true);
    setFail(null);
    try {
      await fn();
      await load(txId);
      onChanged?.();
    } catch (e) {
      setFail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const react = (emoji: Reaction) => run(() => setReaction(householdId, txId!, me.user_id, toggleReaction(mine, emoji)));
  const send = () =>
    run(async () => {
      if (editing) await editComment(editing.id, text);
      else await addComment(householdId, txId!, me.user_id, text);
      setText("");
      setEditing(null);
    });
  const options = (c: TxComment) =>
    Alert.alert("Seu comentário", c.body.length > 80 ? `${c.body.slice(0, 80)}…` : c.body, [
      { text: "Cancelar", style: "cancel" },
      { text: "Editar", onPress: () => { setEditing(c); setText(c.body); } },
      { text: "Apagar", style: "destructive", onPress: () => void run(() => deleteComment(c.id)) },
    ]);

  const canSend = text.trim().length > 0 && text.length <= COMMENT_MAX && !busy;
  const input = { flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: t.text, backgroundColor: t.bg, maxHeight: 120 } as const;

  return (
    <Modal visible={tx !== null} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable accessibilityLabel="Fechar conversa" style={{ flex: 1, backgroundColor: "#0008" }} onPress={onClose} />
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: t.surface, maxHeight: "85%", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
          <View style={{ padding: space.lg, paddingBottom: space.sm, gap: 2, flexDirection: "row", alignItems: "flex-start" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Small style={{ textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "600" }}>Conversa</Small>
              <Body style={{ fontWeight: "700", fontSize: 18 }} numberOfLines={2}>{tx?.description ?? ""}</Body>
              {tx ? <Small>{formatBRL(tx.amountCents)}{tx.isPrivate ? ` · 🔒 só você vê esta conversa` : ""}</Small> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={t.textMuted} />
            </Pressable>
          </View>

          <View accessibilityRole="toolbar" style={{ flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md }}>
            {REACTIONS.map((e) => {
              const r = reactions.find((x) => x.emoji === e);
              const selected = mine === e;
              return (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Reagir com ${e}${r ? `, ${r.count}` : ""}`}
                  disabled={busy || !data}
                  onPress={() => void react(e)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 4, minHeight: 40, paddingHorizontal: 10, borderRadius: 999,
                    borderWidth: 1, borderColor: selected ? t.primaryFill : t.border, backgroundColor: selected ? `${t.primaryFill}22` : t.surface,
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{e}</Text>
                  {r ? <Text style={{ color: selected ? t.primary : t.textSecondary, fontSize: 13, fontWeight: "600" }}>{r.count}</Text> : null}
                </Pressable>
              );
            })}
          </View>

          <ScrollView style={{ borderTopWidth: 1, borderTopColor: t.border }} contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
            {!data && !fail ? <ActivityIndicator color={t.textMuted} /> : null}
            {data && data.comments.length === 0 ? (
              <Small style={{ textAlign: "center" }}>
                {tx?.isPrivate ? "Anote algo só para você." : `Pergunte ou comente — ${partner?.display_name ?? "seu par"} recebe um aviso.`}
              </Small>
            ) : null}
            {(data?.comments ?? []).map((c) => (
              <Bubble key={c.id} mine={c.authorId === me.user_id} onLongPress={c.authorId === me.user_id ? () => options(c) : undefined}>
                <Small style={{ fontWeight: "600" }}>{name(c.authorId)} · {timeLabel(c.createdAt)}{c.editedAt ? " · editado" : ""}</Small>
                <Body>{c.body}</Body>
              </Bubble>
            ))}
            {fail ? <ErrorText message={fail} /> : null}
          </ScrollView>

          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: 4, borderTopWidth: 1, borderTopColor: t.border }}>
            {editing ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Small>Editando seu comentário</Small>
                <Pressable accessibilityRole="button" onPress={() => { setEditing(null); setText(""); }} hitSlop={8}>
                  <Small style={{ color: t.primary, fontWeight: "600" }}>Cancelar</Small>
                </Pressable>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
              <TextInput
                style={input}
                multiline
                maxLength={COMMENT_MAX}
                placeholder="Escreva um comentário…"
                placeholderTextColor={t.textMuted}
                value={text}
                onChangeText={setText}
                accessibilityLabel="Comentário"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={editing ? "Salvar edição" : "Enviar comentário"}
                disabled={!canSend}
                onPress={() => void send()}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: canSend ? t.primaryFill : t.surfaceAlt }}
              >
                {busy ? <ActivityIndicator color={t.onPrimary} /> : <Ionicons name={editing ? "checkmark" : "arrow-up"} size={22} color={canSend ? t.onPrimary : t.textMuted} />}
              </Pressable>
            </View>
            {text.length > COMMENT_MAX - 50 ? <Small style={{ textAlign: "right" }}>{text.length}/{COMMENT_MAX}</Small> : null}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Bubble({ mine, children, onLongPress }: { mine: boolean; children: ReactNode; onLongPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onLongPress={onLongPress}
      accessibilityHint={onLongPress ? "Toque longo para editar ou apagar" : undefined}
      style={{
        alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "88%", gap: 2,
        paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md,
        backgroundColor: mine ? `${t.primaryFill}1a` : t.surfaceAlt,
        borderBottomRightRadius: mine ? 4 : radius.md, borderBottomLeftRadius: mine ? radius.md : 4,
      }}
    >
      {children}
    </Pressable>
  );
}

/**
 * Conversas numa lista de lançamentos: contadores 💬 por item e a folha "Conversa".
 * Uso: `const threads = useTxThreads(ids)`; no item `thread={threads.badge(tx)}`; no fim da tela `{threads.sheet}`.
 */
export function useTxThreads(txIds: string[]) {
  const [summaries, setSummaries] = useState<Record<string, ThreadSummary>>({});
  const [open, setOpen] = useState<ThreadTx | null>(null);
  const [version, setVersion] = useState(0);
  const key = txIds.join(",");

  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetchThreadSummaries(key.split(",")).then(
      (s) => { if (alive) setSummaries(s); },
      () => {}, // contadores são extras: a lista funciona sem eles
    );
    return () => { alive = false; };
  }, [key, version]);

  return {
    summaries,
    open: setOpen,
    badge: (tx: ThreadTx) => ({ ...(summaries[tx.id] ?? { comments: 0, reactions: [] }), onOpen: () => setOpen(tx) }),
    sheet: <TxThread tx={open} onClose={() => setOpen(null)} onChanged={() => setVersion((v) => v + 1)} />,
  };
}
