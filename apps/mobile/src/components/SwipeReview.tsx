import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, PanResponder, Pressable, Text, useWindowDimensions, View } from "react-native";
import { categoryName, formatBrDayMonth, REVIEW_SOURCE_LABEL, type ReviewSuggestion } from "@financas/core";
import { CategorySheet, type CategoryChoice } from "@/components/CategorySheet";
import { Button, Card, Empty, ErrorText, Money, Small } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { applyWithUndo, undoApply, type UndoToken } from "@/lib/review-undo";
import { categoryColor, radius, space, useTheme } from "@/lib/theme";

export interface ReviewCard {
  key: string;
  label: string;
  /** lançamentos do mesmo estabelecimento (o primeiro é o mais recente) */
  items: { id: string; description_raw: string; posted_on: string }[];
  totalCents: number;
  suggestion: ReviewSuggestion | null;
}

type Action = { pos: number; key: string; kind: "skip" } | { pos: number; key: string; kind: "apply"; token: Promise<UndoToken | null> };

const SWIPE_THRESHOLD = 110;

/**
 * Revisão por cartões (inspirada no Card Mode do YNAB): um estabelecimento por vez.
 * Direita = aceita a sugestão (vira regra para os dois), esquerda = deixa para depois, toque = outra categoria.
 * Gesto com PanResponder + Animated (sem dependência nativa, roda no Expo Go).
 */
export function SwipeReview({ cards, meUserId }: { cards: ReviewCard[]; meUserId: string }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  // a fila é fixa enquanto o usuário revisa (recarregar a tela não embaralha os cartões)
  const [deck, setDeck] = useState<ReviewCard[]>(cards);
  const [pos, setPos] = useState(0);
  const [history, setHistory] = useState<Action[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [pan] = useState(() => new Animated.ValueXY());
  const armed = useRef(0);
  const animating = useRef(false);

  const card = deck[pos];
  const next = deck[pos + 1];

  // novo cartão no topo → volta ao centro (depois do render, sem piscar o anterior)
  useLayoutEffect(() => {
    pan.setValue({ x: 0, y: 0 });
    armed.current = 0;
    animating.current = false;
  }, [card?.key, pan]);

  /** Grava em série (uma correção depois da outra), para o desfazer não atropelar. */
  function enqueue<T>(fn: () => Promise<T>): Promise<T | null> {
    const p = chain.current.then(fn).catch((e: unknown) => {
      setFail((e as Error).message);
      return null;
    });
    chain.current = p;
    return p;
  }

  function apply(c: ReviewCard, choice: CategoryChoice) {
    setFail(null);
    const token = enqueue(() => applyWithUndo({ description: c.items[0]!.description_raw, ids: c.items.map((i) => i.id), choice, meUserId }));
    setHistory((h) => [...h, { pos, key: c.key, kind: "apply", token }]);
    setPos((p) => p + 1);
  }

  function accept() {
    if (!card?.suggestion) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    apply(card, { categoryId: card.suggestion.categoryId, ownerUserId: undefined, always: true });
    AccessibilityInfo.announceForAccessibility(`${categoryName(card.suggestion.categoryId)} aplicada`);
  }

  function skip() {
    if (!card) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHistory((h) => [...h, { pos, key: card.key, kind: "skip" }]);
    setPos((p) => p + 1);
  }

  /** Anima o cartão para fora e executa a ação. */
  function fly(dir: 1 | -1) {
    if (!card || animating.current) return;
    if (dir === 1 && !card.suggestion) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      setSheetOpen(true);
      return;
    }
    animating.current = true;
    Animated.timing(pan, { toValue: { x: dir * (width + 80), y: 0 }, duration: 200, useNativeDriver: false }).start(() => (dir === 1 ? accept() : skip()));
  }

  async function undo() {
    const last = history[history.length - 1];
    if (!last || undoing) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHistory((h) => h.slice(0, -1));
    setPos(last.pos);
    setFail(null);
    if (last.kind === "apply") {
      setUndoing(true);
      const token = await last.token;
      if (token) await enqueue(() => undoApply(token));
      setUndoing(false);
    }
  }

  // o PanResponder é criado uma vez; a ação sempre usa o cartão atual
  const flyRef = useRef(fly);
  useEffect(() => {
    flyRef.current = fly;
  });
  // os handlers só leem os refs durante o gesto (eventos), nunca no render
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        pan.setValue({ x: g.dx, y: g.dy * 0.2 });
        const zone = g.dx > SWIPE_THRESHOLD ? 1 : g.dx < -SWIPE_THRESHOLD ? -1 : 0;
        if (zone !== armed.current) {
          armed.current = zone;
          if (zone !== 0) void Haptics.selectionAsync();
        }
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dx > SWIPE_THRESHOLD || g.vx > 0.8) flyRef.current(1);
        else if (g.dx < -SWIPE_THRESHOLD || g.vx < -0.8) flyRef.current(-1);
        else Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start(),
    }),
  );

  const rotate = pan.x.interpolate({ inputRange: [-width, 0, width], outputRange: ["-14deg", "0deg", "14deg"] });
  const acceptOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: "clamp" });
  const skipOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: "clamp" });
  const nextScale = pan.x.interpolate({ inputRange: [-width, 0, width], outputRange: [1, 0.94, 1], extrapolate: "clamp" });

  const skipped = history.filter((a) => a.kind === "skip").map((a) => a.key);
  const restartSkipped = () => {
    const keys = new Set(skipped);
    setDeck(deck.filter((c) => keys.has(c.key)));
    setPos(0);
    setHistory([]);
  };

  const undoButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Desfazer o último"
      disabled={history.length === 0 || undoing}
      onPress={() => void undo()}
      hitSlop={8}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, opacity: history.length === 0 ? 0.35 : pressed ? 0.6 : 1 })}
    >
      <Ionicons name="arrow-undo" size={16} color={t.textSecondary} />
      <Text style={{ color: t.textSecondary, fontWeight: "600", fontSize: 14 }}>Desfazer</Text>
    </Pressable>
  );

  if (!card) {
    return (
      <View style={{ gap: space.lg }}>
        <Empty title={skipped.length ? `${skipped.length} para depois` : "Tudo revisado 🎉"} hint={skipped.length ? "Os pulados continuam na fila Revisar." : undefined} />
        {fail ? <ErrorText message={fail} /> : null}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: space.md }}>
          {skipped.length ? <Button title="Ver pulados" small onPress={restartSkipped} /> : null}
          {history.length ? <Button title="Desfazer" small variant="secondary" onPress={() => void undo()} /> : null}
        </View>
      </View>
    );
  }

  const s = card.suggestion;
  const color = s ? categoryColor(t, s.categoryId) : t.textMuted;
  const many = card.items.length > 1;

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text accessibilityLiveRegion="polite" style={{ color: t.textMuted, fontWeight: "600", fontSize: 14, fontVariant: ["tabular-nums"] }}>
          {pos + 1} de {deck.length}
        </Text>
        {undoButton}
      </View>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: t.surfaceAlt, overflow: "hidden" }}>
        <View style={{ height: 3, width: `${(pos / deck.length) * 100}%`, backgroundColor: t.primary }} />
      </View>

      <View style={{ minHeight: 340 }}>
        {next ? (
          <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, transform: [{ scale: nextScale }], opacity: 0.7 }}>
            <Card style={{ flex: 1 }}><View /></Card>
          </Animated.View>
        ) : null}
        <Animated.View {...responder.panHandlers} style={{ flex: 1, transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${card.label}, ${formatBRL(card.totalCents)}. ${s ? `Sugestão: ${categoryName(s.categoryId)}.` : "Sem sugestão."} Toque para escolher outra categoria`}
            accessibilityActions={[{ name: "activate" }, { name: "magicTap", label: "Aceitar" }]}
            onAccessibilityAction={(e) => (e.nativeEvent.actionName === "magicTap" ? fly(1) : setSheetOpen(true))}
            onPress={() => { void Haptics.selectionAsync(); setSheetOpen(true); }}
            style={{ flex: 1 }}
          >
            <Card style={{ flex: 1, minHeight: 340, justifyContent: "space-between", padding: space.xl, borderRadius: radius.xl }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Animated.View style={{ opacity: skipOpacity, borderWidth: 2, borderColor: t.textMuted, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: "-8deg" }] }}>
                  <Text style={{ color: t.textMuted, fontWeight: "800", letterSpacing: 1 }}>DEPOIS</Text>
                </Animated.View>
                <Animated.View style={{ opacity: acceptOpacity, borderWidth: 2, borderColor: t.success, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: "8deg" }] }}>
                  <Text style={{ color: t.success, fontWeight: "800", letterSpacing: 1 }}>ACEITAR</Text>
                </Animated.View>
              </View>

              <View style={{ gap: space.sm }}>
                <Text numberOfLines={3} style={{ color: t.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.4 }}>{card.label}</Text>
                <Small>
                  {many ? `${card.items.length} lançamentos · último em ${formatBrDayMonth(card.items[0]!.posted_on)}` : formatBrDayMonth(card.items[0]!.posted_on)}
                </Small>
                <Money cents={card.totalCents} bold style={{ fontSize: 40, letterSpacing: -1 }} />
              </View>

              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
                  <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{s ? categoryName(s.categoryId) : "Escolher categoria"}</Text>
                  <Ionicons name="chevron-down" size={16} color={t.textMuted} />
                </View>
                <Small>{s ? REVIEW_SOURCE_LABEL[s.source] : "Sem sugestão"}</Small>
              </View>
            </Card>
          </Pressable>
        </Animated.View>
      </View>

      {fail ? <ErrorText message={fail} /> : null}

      <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.xl }}>
        <RoundButton icon="arrow-redo" label="Pular, deixar para depois" onPress={() => fly(-1)} />
        <RoundButton icon="checkmark" label={s ? `Aceitar ${categoryName(s.categoryId)}` : "Escolher categoria"} onPress={() => fly(1)} big />
      </View>

      <CategorySheet
        visible={sheetOpen}
        title={card.label}
        subtitle={formatBRL(card.totalCents)}
        matchCount={card.items.length}
        allowPrivate
        onClose={() => setSheetOpen(false)}
        onChoose={(c) => {
          setSheetOpen(false);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          apply(card, c);
        }}
      />
    </View>
  );
}

function RoundButton({ icon, label, onPress, big }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; big?: boolean }) {
  const t = useTheme();
  const size = big ? 72 : 60;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center",
        backgroundColor: big ? t.primaryFill : t.surface, borderWidth: big ? 0 : 1, borderColor: t.border,
        opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <Ionicons name={icon} size={big ? 34 : 26} color={big ? t.onPrimary : t.text} />
    </Pressable>
  );
}
