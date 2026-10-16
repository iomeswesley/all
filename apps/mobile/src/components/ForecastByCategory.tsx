import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { categoryName, FORECAST_LEVEL_LABEL, type CategoryBudgetForecast, type PlannedExpense } from "@financas/core";
import type { Analysis } from "@/lib/analysis";
import { categoryForecastFor, shortCategoryName } from "@/lib/forecast-category";
import { formatBRL } from "@/lib/format";
import { categoryColor, space, useTheme } from "@/lib/theme";
import { Badge, Card, SectionTitle, Small } from "./ui";

const VISIBLE = 6;
const BAR = 10;

/**
 * Previsão do mês por categoria contra o limite do orçamento: barra do previsto, marca do limite
 * e a parte que passa do limite em vermelho. As que vão estourar vêm primeiro.
 */
export function ForecastByCategory({ analysis, planned, today, monthKey }: { analysis: Analysis; planned: readonly PlannedExpense[]; today: string; monthKey: string }) {
  const t = useTheme();
  const [all, setAll] = useState(false);
  const cmp = useMemo(() => categoryForecastFor(analysis, planned, today, monthKey), [analysis, planned, today, monthKey]);
  if (!cmp) return null;
  const rows = cmp.rows.filter((r) => r.totalCents > 0 || r.limitCents !== null);
  if (rows.length === 0) return null;

  const max = Math.max(...rows.map((r) => Math.max(r.totalCents, r.limitCents ?? 0)), 1);
  const shown = all ? rows : rows.slice(0, VISIBLE);
  const hasLimits = rows.some((r) => r.limitCents !== null);
  const badge = cmp.over > 0
    ? <Badge tone="bad" label={cmp.over === 1 ? "1 vai estourar" : `${cmp.over} vão estourar`} />
    : cmp.near > 0
      ? <Badge tone="warn" label={cmp.near === 1 ? "1 perto do limite" : `${cmp.near} perto do limite`} />
      : hasLimits ? <Badge tone="good" label="Dentro do orçamento" /> : null;

  return (
    <Card>
      <SectionTitle right={badge}>Por categoria</SectionTitle>
      <View style={{ gap: space.md + 2 }}>
        {shown.map((r) => <CategoryBar key={r.categoryId} row={r} max={max} />)}
      </View>
      {rows.length > VISIBLE ? (
        <Pressable accessibilityRole="button" onPress={() => setAll((v) => !v)} hitSlop={8} style={{ alignSelf: "center", paddingVertical: 4, minHeight: 32, justifyContent: "center" }}>
          <Text style={{ color: t.primary, fontWeight: "600", fontSize: 14 }}>{all ? "Mostrar menos" : `Ver todas (${rows.length})`}</Text>
        </Pressable>
      ) : null}
      {hasLimits ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 2, height: 12, borderRadius: 1, backgroundColor: t.text }} />
          <Small>limite do orçamento</Small>
        </View>
      ) : null}
    </Card>
  );
}

function CategoryBar({ row, max }: { row: CategoryBudgetForecast; max: number }) {
  const t = useTheme();
  const total = Math.max(row.totalCents, 0);
  const limit = row.limitCents;
  const over = row.level === "estoura";
  const color = categoryColor(t, row.categoryId);
  const within = limit === null ? total : Math.min(total, limit);
  const excess = limit === null ? 0 : Math.max(total - limit, 0);
  const pct = (c: number) => `${(c / max) * 100}%` as const;
  const name = shortCategoryName(categoryName(row.categoryId));
  const a11y = `${categoryName(row.categoryId)}: previsto ${formatBRL(total)}${limit !== null ? `, limite ${formatBRL(limit)}, ${FORECAST_LEVEL_LABEL[row.level!].toLowerCase()}` : ", sem limite"}`;

  return (
    <View accessible accessibilityLabel={a11y} style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, alignSelf: "center" }} />
        <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: over ? "700" : "500" }}>{name}</Text>
        <Text style={{ color: over ? t.danger : t.text, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{formatBRL(total)}</Text>
        {limit !== null ? <Text style={{ color: t.textMuted, fontSize: 13, fontVariant: ["tabular-nums"] }}>/ {formatBRL(limit)}</Text> : null}
      </View>
      <View style={{ height: BAR + 6, justifyContent: "center" }}>
        <View style={{ height: BAR, borderRadius: BAR / 2, backgroundColor: t.surfaceAlt, overflow: "hidden", flexDirection: "row" }}>
          {within > 0 ? <View style={{ width: pct(within), backgroundColor: color, opacity: limit === null ? 0.55 : 1, borderTopRightRadius: excess > 0 ? 0 : BAR / 2, borderBottomRightRadius: excess > 0 ? 0 : BAR / 2 }} /> : null}
          {excess > 0 ? <View style={{ width: pct(excess), backgroundColor: t.danger, borderTopRightRadius: BAR / 2, borderBottomRightRadius: BAR / 2 }} /> : null}
        </View>
        {limit !== null ? (
          <View pointerEvents="none" style={{ position: "absolute", left: pct(limit), marginLeft: -1, top: 0, bottom: 0, width: 2, borderRadius: 1, backgroundColor: t.text }} />
        ) : null}
      </View>
      {over && row.overCents > 0 ? <Small style={{ color: t.danger }}>+{formatBRL(row.overCents)} acima do limite</Small> : row.level === "perto" ? <Small style={{ color: t.warning }}>{row.percent}% do limite</Small> : null}
    </View>
  );
}
