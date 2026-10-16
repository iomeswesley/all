import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { categoryName, formatBrDayMonth } from "@financas/core";
import { categoryColor, space, useTheme } from "@/lib/theme";
import { Body, Money, Small } from "./ui";
import { formatUSD } from "@/lib/format";

export interface TxItemData {
  id: string;
  postedOn: string;
  descriptionClean: string;
  amountCents: number;
  amountUsdCents: number | null;
  categoryId: number | null;
  installmentN: number | null;
  installmentTotal: number | null;
  needsReview: boolean;
  ownerLabel?: string | null;
  isPrivate?: boolean;
}

/** Conversa do lançamento (comentários/reações): contador 💬 e o toque que abre a folha. */
export interface TxThreadBadge {
  comments: number;
  reactions: string[];
  onOpen: () => void;
}

export function TxItem({ tx, onPress, onMore, thread }: { tx: TxItemData; onPress?: () => void; onMore?: () => void; thread?: TxThreadBadge }) {
  const t = useTheme();
  const parts = [
    categoryName(tx.categoryId),
    tx.installmentN ? `parcela ${tx.installmentN}/${tx.installmentTotal}` : null,
    tx.amountUsdCents ? formatUSD(tx.amountUsdCents) : null,
    tx.ownerLabel ?? null,
  ].filter(Boolean);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingVertical: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tx.descriptionClean}, ${parts.join(", ")}. Mudar categoria`}
        onPress={onPress}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.md }}
      >
        <View style={{ width: 8, alignSelf: "stretch", borderRadius: 4, backgroundColor: tx.needsReview ? t.warning : categoryColor(t, tx.categoryId), opacity: tx.needsReview ? 1 : 0.9 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Body numberOfLines={1} style={{ fontWeight: "500" }}>{tx.descriptionClean}</Body>
          <Small>{formatBrDayMonth(tx.postedOn)} · {parts.join(" · ")}{tx.needsReview ? " · revisar" : ""}{tx.isPrivate ? " · 🔒 pessoal" : ""}</Small>
        </View>
        <Money cents={tx.amountCents} color={tx.amountCents < 0 ? t.success : undefined} />
      </Pressable>
      {thread ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={thread.comments > 0 ? `Conversa, ${thread.comments} comentário${thread.comments > 1 ? "s" : ""}` : "Abrir conversa"}
          onPress={thread.onOpen}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 4, paddingVertical: 10 }}
        >
          {thread.reactions.slice(0, 2).map((e) => <Text key={e} style={{ fontSize: 13 }}>{e}</Text>)}
          {thread.comments > 0 ? <Text style={{ color: t.primary, fontSize: 13, fontWeight: "600" }}>💬 {thread.comments}</Text> : thread.reactions.length === 0 ? <Ionicons name="chatbubble-outline" size={17} color={t.textMuted} /> : null}
        </Pressable>
      ) : null}
      {onMore ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Mais opções do lançamento" onPress={onMore} hitSlop={8} style={{ paddingHorizontal: 6, paddingVertical: 10 }}>
          <Text style={{ color: t.textMuted, fontSize: 20 }}>⋯</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
