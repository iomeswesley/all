import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  categoriesIn, categoryName, effectiveDate, formatBrDayMonth, formatMonthLong, groupByMonth, searchTransactions, summarize, withSearchText,
  SEARCH_PERIOD_LABEL, SEARCH_TYPE_LABEL, type SearchListItem, type SearchOwner, type SearchPeriod, type SearchType,
} from "@financas/core";
import { Chip, Empty, ErrorText, IconButton, Loading, Money, Small } from "@/components/ui";
import { useAnalysis } from "@/lib/analysis";
import type { TxRow } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { localToday } from "@/lib/today";
import { useReady } from "@/lib/session";
import { categoryColor, radius, space, useTheme } from "@/lib/theme";

type Item = TxRow & { manual: boolean };
type ListItem = SearchListItem<Item>;

const PERIODS: SearchPeriod[] = ["month", "3m", "year", "all"];
const TYPES: SearchType[] = ["avista", "parcela", "manual", "estorno", "encargo"];
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Todos os lançamentos (cartão + Pix/dinheiro) com busca, filtros e total ao vivo.
 * O gasto pessoal do par não aparece na lista nem no total (ver packages/core/src/search.ts);
 * quando os filtros permitem, a barra mostra à parte quanto dele cai no filtro.
 * A seleção múltipla soma só os selecionados que ainda passam nos filtros atuais.
 */
export default function Busca() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { me, partner } = useReady();
  const { data, error, loading, reload } = useAnalysis();

  const [text, setText] = useState("");
  const query = useDeferredValue(text);
  const [period, setPeriod] = useState<SearchPeriod>("3m");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [owner, setOwner] = useState<SearchOwner | null>(null);
  const [type, setType] = useState<SearchType | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const txs = useMemo<Item[]>(() => withSearchText((data?.txs ?? []).map((x) => ({ ...x, manual: x.statementId === "" && !x.hiddenAggregate }))), [data]);
  const categories = useMemo(() => categoriesIn(txs), [txs]);
  const result = useMemo(
    () => searchTransactions(txs, { text: query, period, categoryId, owner, type }, { today: localToday(), meUserId: me.user_id, partnerUserId: partner?.user_id ?? null }),
    [txs, query, period, categoryId, owner, type, me.user_id, partner],
  );
  const items = useMemo(() => groupByMonth(result.rows, (x) => x.id), [result.rows]);
  const picked = useMemo(() => (selected ? result.rows.filter((x) => selected.has(x.id)) : []), [selected, result.rows]);
  const summary = selected ? summarize(picked) : result;

  const toggle = useCallback((id: string) => {
    setSelected((cur) => {
      const next = new Set(cur ?? []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const ownerLabel = (uid: string | null) => (uid === null ? "nosso" : uid === me.user_id ? "meu" : partner?.display_name ?? "par");

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "month") {
      return (
        <View style={styles.monthRow}>
          <Text style={[styles.monthLabel, { color: t.textMuted }]}>{capital(formatMonthLong(item.month))}</Text>
          <Text style={[styles.monthLabel, { color: t.textMuted, fontVariant: ["tabular-nums"] }]}>{formatBRL(item.totalCents)}</Text>
        </View>
      );
    }
    const x = item.tx;
    const on = selected?.has(x.id) ?? false;
    const meta = [
      formatBrDayMonth(effectiveDate(x)),
      categoryName(x.categoryId),
      x.installmentN ? `${x.installmentN}/${x.installmentTotal}` : x.manual ? "Pix/dinheiro" : null,
      ownerLabel(x.ownerUserId),
    ].filter(Boolean).join(" · ");
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={selected ? { selected: on } : undefined}
        accessibilityLabel={`${x.descriptionClean}, ${formatBRL(x.amountCents)}, ${meta}`}
        accessibilityHint={selected ? "Toque para marcar ou desmarcar" : "Toque longo para selecionar e somar"}
        delayLongPress={300}
        onLongPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); toggle(x.id); }}
        onPress={() => {
          if (selected) { void Haptics.selectionAsync(); toggle(x.id); return; }
          if (x.manual) router.push("/lancamentos");
          else if (x.statementId) router.push({ pathname: "/fatura/[id]", params: { id: x.statementId } });
        }}
        style={({ pressed }) => [styles.tx, { backgroundColor: on ? t.surfaceAlt : t.surface, borderColor: on ? t.primaryFill : t.border, opacity: pressed ? 0.7 : 1 }]}
      >
        {selected ? (
          <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={22} color={on ? t.primary : t.textMuted} />
        ) : (
          <View style={[styles.dot, { backgroundColor: categoryColor(t, x.categoryId) }]} />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontSize: 15, fontWeight: "500" }}>{x.merchantName ?? x.descriptionClean}</Text>
          <Small>{meta}</Small>
        </View>
        <Money cents={x.amountCents} color={x.amountCents < 0 ? t.success : undefined} />
      </Pressable>
    );
  };

  const chips = (
    <View style={{ gap: space.sm, paddingBottom: space.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {PERIODS.map((p) => <Chip key={p} label={SEARCH_PERIOD_LABEL[p]} selected={period === p} onPress={() => setPeriod(p)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="Meu" selected={owner === "me"} onPress={() => setOwner(owner === "me" ? null : "me")} />
        {partner ? <Chip label={partner.display_name} selected={owner === "partner"} onPress={() => setOwner(owner === "partner" ? null : "partner")} /> : null}
        <Chip label="Nosso" selected={owner === "shared"} onPress={() => setOwner(owner === "shared" ? null : "shared")} />
        <View style={[styles.sep, { backgroundColor: t.border }]} />
        {TYPES.map((k) => <Chip key={k} label={SEARCH_TYPE_LABEL[k]} selected={type === k} onPress={() => setType(type === k ? null : k)} />)}
      </ScrollView>
      {categories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {categories.map((id) => <Chip key={id} label={categoryName(id)} color={categoryColor(t, id)} selected={categoryId === id} onPress={() => setCategoryId(categoryId === id ? null : id)} />)}
        </ScrollView>
      ) : null}
      {error ? <ErrorText message={error} /> : null}
    </View>
  );

  const avg = summary.count > 0 ? ` · média ${formatBRL(summary.averageCents)}` : "";
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[styles.search, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Ionicons name="search" size={18} color={t.textMuted} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Buscar estabelecimento"
          placeholderTextColor={t.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Buscar lançamentos"
          style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 12 }}
        />
        {text ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" hitSlop={10} onPress={() => setText("")}>
            <Ionicons name="close-circle" size={18} color={t.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {loading && !data ? <Loading /> : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.key}
          renderItem={renderItem}
          ListHeaderComponent={chips}
          ListEmptyComponent={<Empty title="Nada encontrado" hint="Tente outro período ou tire um filtro." />}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl * 4 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshing={loading}
          onRefresh={reload}
          initialNumToRender={20}
          windowSize={11}
          extraData={selected}
        />
      )}

      <View style={[styles.bar, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Small>{selected ? `${summary.count} selecionado${summary.count === 1 ? "" : "s"}` : "Total filtrado"}</Small>
          <Money cents={summary.totalCents} bold style={{ fontSize: 22, letterSpacing: -0.4 }} />
          <Small>
            {selected ? `${summary.count} de ${result.count}${avg}` : `${summary.count} lançamento${summary.count === 1 ? "" : "s"}${avg}`}
            {!selected && result.hiddenCents ? ` · +${formatBRL(result.hiddenCents)} pessoal do par` : ""}
          </Small>
        </View>
        {selected ? (
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <IconButton icon="checkmark-done" label="Selecionar todos os filtrados" onPress={() => setSelected(new Set(result.rows.map((x) => x.id)))} />
            <IconButton icon="close" label="Sair da seleção" onPress={() => setSelected(null)} />
          </View>
        ) : (
          <IconButton icon="checkbox-outline" label="Selecionar lançamentos" onPress={() => setSelected(new Set())} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginTop: space.sm, marginBottom: space.md, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  chipRow: { gap: space.sm, alignItems: "center" },
  sep: { width: StyleSheet.hairlineWidth, height: 24, marginHorizontal: space.xs },
  monthRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: space.lg, paddingBottom: space.sm },
  monthLabel: { fontSize: 13, fontWeight: "600", letterSpacing: 0.4 },
  tx: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 60, paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, marginBottom: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
