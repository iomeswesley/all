import { useMemo } from "react";
import { View } from "react-native";
import { categoryName, detectHabits, formatMonthShort, addMonthsToKey } from "@financas/core";
import { formatBRL } from "@/lib/format";
import { Badge, Body, Card, Empty, ErrorText, H1, Loading, Money, Screen, Small } from "@/components/ui";
import { monthsOf, useAnalysis } from "@/lib/analysis";
import { space, useTheme } from "@/lib/theme";

export default function Habitos() {
  const t = useTheme();
  const { data, error, loading, reload } = useAnalysis();
  const view = useMemo(() => {
    if (!data) return null;
    const months = monthsOf(data.txs);
    const latest = months[months.length - 1];
    if (!latest) return null;
    return { latest, habits: detectHabits(data.txs, latest), from: months[Math.max(months.length - 6, 0)]! };
  }, [data]);

  if (loading && !data) return <Screen><Loading /></Screen>;
  const total = view?.habits.reduce((a, h) => a + h.annualCostCents, 0) ?? 0;
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <H1>Custo do hábito</H1>
      <Body muted>Lugares aonde vocês vão com muita frequência. Pouco por vez, muito por ano.</Body>
      {error ? <ErrorText message={error} /> : null}
      {!view || view.habits.length === 0 ? (
        <Empty title="Nenhum hábito detectado" hint="Procuro estabelecimentos com 6 ou mais visitas por mês. Importe mais faturas para ver o padrão." />
      ) : (
        <>
          <Card>
            <Small>Os {view.habits.length} maiores hábitos juntos custam</Small>
            <Money cents={total} bold style={{ fontSize: 30 }} />
            <Small>por ano · base: {formatMonthShort(view.from)} a {formatMonthShort(view.latest)} (média mensal × 12)</Small>
          </Card>
          {view.habits.map((h) => (
            <Card key={h.key} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: "700", fontSize: 16 }} numberOfLines={2}>{h.label}</Body>
                  <Small>{categoryName(h.categoryId)}</Small>
                </View>
                <Badge label={h.cadence} tone="warn" />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Stat label="Visitas/mês" value={String(h.visitsPerMonth).replace(".", ",")} />
                <Stat label="Por semana" value={String(h.visitsPerWeek).replace(".", ",")} />
                <Stat label="Ticket médio" value={formatBRL(h.avgTicketCents)} />
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: space.sm, gap: 2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Body muted>Por mês</Body>
                  <Money cents={h.monthlyCostCents} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Body style={{ fontWeight: "700" }}>Por ano</Body>
                  <Money cents={h.annualCostCents} bold color={t.warning} />
                </View>
                <Small>Cortar 1 visita em cada 4 economiza {formatBRL(h.saveIfCutQuarterCents * 12)} por ano.</Small>
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Small>{label}</Small>
      <Body style={{ fontWeight: "600" }}>{value}</Body>
    </View>
  );
}
