import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { categoryName, formatMonthShort, percent, type CategoryTotal, type MonthlyCategorySeries } from "@financas/core";
import { privacyOn } from "@/lib/prefs";
import { categoryColor, isFoldedCategory, space, STACK_ORDER, useTheme } from "@/lib/theme";
import { Body, Small } from "./ui";
import { formatBRL } from "@/lib/format";

const compactBRL = (reais: number) => (reais >= 1000 ? `${(reais / 1000).toFixed(reais >= 10000 ? 0 : 1).replace(".", ",")} mil` : String(Math.round(reais)));

/** Rosca por categoria com legenda (valor e %). Categorias fora dos 8 matizes viram "Demais". */
export function CategoryDonut({ rows }: { rows: CategoryTotal[] }) {
  const t = useTheme();
  const total = rows.reduce((a, r) => a + r.totalCents, 0);

  const { slices, legend } = useMemo(() => {
    const colored = rows.filter((r) => !isFoldedCategory(r.categoryId));
    const folded = rows.filter((r) => isFoldedCategory(r.categoryId));
    const foldedTotal = folded.reduce((a, r) => a + r.totalCents, 0);
    const slices = colored.map((r) => ({ value: r.totalCents / 100, color: categoryColor(t, r.categoryId) }));
    if (foldedTotal > 0) slices.push({ value: foldedTotal / 100, color: t.other });
    return { slices, legend: { colored, folded, foldedTotal } };
  }, [rows, t]);

  if (total <= 0) return <Body muted>Sem gastos neste mês.</Body>;
  return (
    <View style={{ gap: space.md }}>
      <View style={{ alignItems: "center" }} accessibilityLabel={`Gastos por categoria, total ${formatBRL(total)}`}>
        <PieChart
          data={slices}
          donut
          radius={92}
          innerRadius={62}
          innerCircleColor={t.surface}
          strokeWidth={2}
          strokeColor={t.surface}
          centerLabelComponent={() => (
            <View style={{ alignItems: "center" }}>
              <Small>Total</Small>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{formatBRL(total)}</Text>
            </View>
          )}
        />
      </View>
      <View>
        {legend.colored.map((r) => (
          <LegendRow key={r.categoryId} color={categoryColor(t, r.categoryId)} label={categoryName(r.categoryId)} cents={r.totalCents} pct={r.percent} />
        ))}
        {legend.foldedTotal > 0 ? (
          <LegendRow
            color={t.other}
            label="Demais"
            note={legend.folded.map((r) => categoryName(r.categoryId)).join(", ")}
            cents={legend.foldedTotal}
            pct={percent(legend.foldedTotal, total)}
          />
        ) : null}
      </View>
    </View>
  );
}

function LegendRow({ color, label, note, cents, pct }: { color: string; label: string; note?: string; cents: number; pct: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
      <View style={{ flex: 1 }}>
        <Body numberOfLines={1}>{label}</Body>
        {note ? <Small>{note}</Small> : null}
      </View>
      <Text style={{ color: t.text, fontVariant: ["tabular-nums"] }}>{formatBRL(cents)}</Text>
      <Text style={{ color: t.textMuted, width: 40, textAlign: "right", fontVariant: ["tabular-nums"] }}>{pct}%</Text>
    </View>
  );
}

/** Barras empilhadas mês a mês (12 meses) por categoria. */
export function MonthlyStackedBars({ series, selectedMonth, onSelect }: { series: MonthlyCategorySeries; selectedMonth?: string; onSelect?: (month: string) => void }) {
  const t = useTheme();
  const [picked, setPicked] = useState<string | null>(null);

  const stackData = useMemo(
    () =>
      series.months.map((month, i) => {
        const stacks: { value: number; color: string }[] = [];
        for (const id of STACK_ORDER) {
          const v = series.byCategory.get(id)?.[i] ?? 0;
          if (v > 0) stacks.push({ value: v / 100, color: categoryColor(t, id) });
        }
        let folded = 0;
        for (const [id, arr] of series.byCategory) if (isFoldedCategory(id)) folded += arr[i] ?? 0;
        if (folded > 0) stacks.push({ value: folded / 100, color: t.other });
        return {
          stacks,
          label: formatMonthShort(month).split("/")[0],
          onPress: () => { setPicked(month); onSelect?.(month); },
        };
      }),
    [series, t, onSelect],
  );

  const shown = picked ?? selectedMonth ?? series.months[series.months.length - 1]!;
  const idx = series.months.indexOf(shown);
  const maxCents = Math.max(...series.totals, 1);

  const summary = series.months.map((m, i) => `${formatMonthShort(m)} ${formatBRL(series.totals[i] ?? 0)}`).join("; ");
  return (
    <View style={{ gap: space.sm }}>
      <Body style={{ fontWeight: "600" }}>{formatMonthShort(shown)}: {formatBRL(series.totals[idx] ?? 0)}</Body>
      <View accessible accessibilityRole="image" accessibilityLabel={`Gráfico de barras dos últimos 12 meses por categoria. Totais: ${summary}`}>
      <BarChart
        stackData={stackData}
        barWidth={18}
        spacing={10}
        initialSpacing={6}
        height={180}
        noOfSections={4}
        maxValue={Math.ceil(maxCents / 100 / 1000) * 1000 || 1000}
        stackBorderRadius={3}
        rulesColor={t.border}
        yAxisColor="transparent"
        xAxisColor={t.border}
        yAxisTextStyle={{ color: t.textMuted, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: t.textMuted, fontSize: 10 }}
        yAxisLabelWidth={42}
        hideYAxisText={privacyOn}
        formatYLabel={(l) => (privacyOn ? "" : compactBRL(Number(l)))}
        scrollToEnd
        disableScroll={false}
      />
      </View>
    </View>
  );
}

/** Barras horizontais proporcionais (top estabelecimentos, parcelas, meu/dela/nosso). */
export function HBars({ items, color }: { items: { key: string; label: string; cents: number; note?: string; color?: string }[]; color?: string }) {
  const t = useTheme();
  const max = Math.max(...items.map((i) => Math.abs(i.cents)), 1);
  return (
    <View style={{ gap: space.sm }}>
      {items.map((i) => (
        <View key={i.key} style={{ gap: 4 }} accessible accessibilityLabel={`${i.label}: ${formatBRL(i.cents)}`}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <Body numberOfLines={1} style={{ flex: 1 }}>{i.label}</Body>
            <Text style={{ color: t.text, fontVariant: ["tabular-nums"] }}>{formatBRL(i.cents)}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.border, overflow: "hidden" }}>
            <View style={{ height: 8, width: `${Math.max((Math.abs(i.cents) / max) * 100, 2)}%`, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: i.color ?? color ?? t.primary }} />
          </View>
          {i.note ? <Small>{i.note}</Small> : null}
        </View>
      ))}
    </View>
  );
}

/** Uma barra empilhada horizontal com 3 partes (meu / parceiro / nosso). */
export function SplitBar({ parts }: { parts: { key: string; label: string; cents: number; color: string }[] }) {
  const t = useTheme();
  const total = parts.reduce((a, p) => a + Math.max(p.cents, 0), 0);
  if (total <= 0) return <Body muted>Sem gastos neste mês.</Body>;
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", gap: 2, backgroundColor: t.surface }}>
        {parts.filter((p) => p.cents > 0).map((p) => (
          <View key={p.key} style={{ flex: p.cents, backgroundColor: p.color }} />
        ))}
      </View>
      {parts.map((p) => (
        <LegendRow key={p.key} color={p.color} label={p.label} cents={p.cents} pct={percent(p.cents, total)} />
      ))}
    </View>
  );
}
