import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { categoryName, formatMonthShort, paceStatusLabel, type CategoryPace } from "@financas/core";
import type { Analysis } from "@/lib/analysis";
import { shortCategoryName } from "@/lib/forecast-category";
import { formatBRL } from "@/lib/format";
import { paceFor } from "@/lib/pace";
import { categoryColor, space, useTheme } from "@/lib/theme";
import { Badge, Card, SectionTitle, Small } from "./ui";

const BAR = 8;

/**
 * "No ritmo atual, o mês fecha em R$ X" (mês corrente). A barra mostra o que já aconteceu
 * contra o projetado, com a marca do dia de hoje; a fórmula fica visível numa linha.
 * As categorias que vão estourar ou estão perto do limite aparecem embaixo.
 */
export function PaceCard({ analysis, today }: { analysis: Analysis; today: string }) {
  const t = useTheme();
  const router = useRouter();
  const pace = useMemo(() => paceFor(analysis, today), [analysis, today]);
  if (!pace) return null;

  const alert = pace.categories.filter((c) => c.level === "estoura" || c.level === "perto").slice(0, 3);
  const hasLimits = pace.categories.some((c) => c.limitCents !== null);
  const badge = pace.over > 0
    ? <Badge tone="bad" label={pace.over === 1 ? "1 vai estourar" : `${pace.over} vão estourar`} />
    : pace.near > 0
      ? <Badge tone="warn" label={pace.near === 1 ? "1 perto" : `${pace.near} perto`} />
      : hasLimits ? <Badge tone="good" label="Dentro" /> : null;
  const done = pace.projectedCents > 0 ? Math.min(Math.max(pace.spentCents, 0) / pace.projectedCents, 1) : 0;
  const dayPct = `${(pace.day / pace.daysInMonth) * 100}%` as const;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Ritmo do mês: fecha em ${formatBRL(pace.projectedCents)}. ${pace.formula}. Abrir orçamento`} onPress={() => router.push("/orcamento")}>
      <Card>
        <SectionTitle right={badge}>Ritmo do mês</SectionTitle>
        <View style={{ gap: 2 }}>
          <Small>No ritmo atual, fecha em</Small>
          <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: t.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, fontVariant: ["tabular-nums"] }}>{formatBRL(pace.projectedCents)}</Text>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ height: BAR + 8, justifyContent: "center" }}>
            <View style={{ height: BAR, borderRadius: BAR / 2, backgroundColor: t.surfaceAlt, overflow: "hidden" }}>
              <View style={{ height: BAR, width: `${done * 100}%`, backgroundColor: t.primary, borderRadius: BAR / 2 }} />
            </View>
            <View style={{ position: "absolute", left: dayPct, top: 0, bottom: 0, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: t.text }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Small>{formatBRL(pace.spentCents)} até hoje</Small>
            <Small>dia {pace.day} de {pace.daysInMonth}</Small>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="calculator-outline" size={14} color={t.textMuted} />
          <Small style={{ flex: 1 }}>{pace.formula}</Small>
        </View>
        {alert.length > 0 ? (
          <View style={{ gap: space.sm, paddingTop: space.xs }}>
            {alert.map((c) => <PaceRow key={c.categoryId} row={c} />)}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

function PaceRow({ row }: { row: CategoryPace }) {
  const t = useTheme();
  const color = row.level === "estoura" ? t.danger : t.warning;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: categoryColor(t, row.categoryId) }} />
      <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: "500" }}>{shortCategoryName(categoryName(row.categoryId))}</Text>
      <Text style={{ color, fontSize: 13, fontWeight: "600" }}>{paceStatusLabel(row)}</Text>
      <Text style={{ color: t.textMuted, fontSize: 13, fontVariant: ["tabular-nums"] }}>{formatBRL(row.projectedCents)} / {formatBRL(row.limitCents ?? 0)}</Text>
    </View>
  );
}

/** Linha discreta para a tela de orçamento: ritmo da categoria no mês corrente. */
export function PaceLine({ row, month }: { row: CategoryPace | undefined; month: string }) {
  const t = useTheme();
  if (!row || row.projectedCents <= 0) return null;
  const label = paceStatusLabel(row);
  const color = row.alreadyOver || row.level === "estoura" ? t.danger : row.level === "perto" ? t.warning : t.textMuted;
  return <Small style={{ color }}>Ritmo {formatMonthShort(month)}: fecha em {formatBRL(row.projectedCents)}{label ? ` · ${label.toLowerCase()}` : ""}</Small>;
}
