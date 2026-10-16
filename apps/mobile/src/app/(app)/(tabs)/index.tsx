import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { addMonthsToKey, budgetStatuses, categoryName, compareMonths, formatBrDayMonth, formatMonthLong, formatMonthShort, forecastMonths, monthlySeries, splitByOwner, topMerchants, totalByCategory, totalSpent, upcomingPlanned, type Change } from "@financas/core";
import { CategoryDonut, HBars, MonthlyStackedBars, SplitBar } from "@/components/charts";
import { Badge, Body, Button, Card, Empty, ErrorText, Header, Hero, HeroPill, IconButton, Loading, Money, Row, Screen, SectionTitle, Small } from "@/components/ui";
import { budgetsFor, defaultMonth, latestStatementMonth, useAnalysis } from "@/lib/analysis";
import { useLoad } from "@/lib/data";
import { fetchPlanned } from "@/lib/planned";
import { localToday } from "@/lib/today";
import { usePrefs } from "@/lib/prefs";
import { useReady } from "@/lib/session";
import { categoryColor, space, useTheme } from "@/lib/theme";
import { formatBRL } from "@/lib/format";
import { useWidgetSync } from "@/widget";

export default function Inicio() {
  const t = useTheme();
  const router = useRouter();
  const { me, partner, householdName } = useReady();
  const { data: analysis, error, loading, reload } = useAnalysis();
  const data = analysis?.txs ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const { privacy, setPrivacy } = usePrefs();
  const planned = useLoad(fetchPlanned);
  const today = localToday();
  useWidgetSync(analysis, planned.data);

  const ahead = useMemo(() => {
    if (!analysis || !planned.data) return null;
    const last = latestStatementMonth(analysis);
    const next = last ? forecastMonths({ txs: analysis.txs, lastMonth: last, planned: planned.data, today, horizon: 1 }).months[0] ?? null : null;
    return { next, upcoming: upcomingPlanned(planned.data, today, 45, 3) };
  }, [analysis, planned.data, today]);

  const view = useMemo(() => {
    if (!data || data.length === 0) return null;
    const months = [...new Set(data.map((x) => x.statementMonth))].sort();
    const month = picked && months.includes(picked) ? picked : (analysis ? defaultMonth(analysis, months) : undefined) ?? months[months.length - 1]!;
    const prev = addMonthsToKey(month, -1);
    const cur = data.filter((x) => x.statementMonth === month);
    const before = data.filter((x) => x.statementMonth === prev);
    const total = totalSpent(cur);
    const prevTotal = totalSpent(before);
    return {
      months, month, prev, total, prevTotal,
      hasPrev: before.length > 0,
      byCategory: totalByCategory(cur),
      series: monthlySeries(data, month, 12),
      catChanges: compareMonths(cur, before, "category", categoryName),
      merchantChanges: compareMonths(cur, before, "merchant"),
      top: topMerchants(cur, 10),
      split: splitByOwner(cur, me.user_id),
      reviewCount: cur.filter((x) => x.needsReview).length,
      budgets: budgetStatuses(budgetsFor(analysis?.budgetRows ?? [], month), cur),
    };
  }, [data, analysis, picked, me.user_id]);

  if (loading && !data) return <Screen><Loading /></Screen>;

  const idx = view ? view.months.indexOf(view.month) : 0;
  const delta = view && view.hasPrev ? view.total - view.prevTotal : null;

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Header
        kicker={householdName}
        title="Resumo"
        right={
          <>
            <IconButton icon={privacy ? "eye-off-outline" : "eye-outline"} label={privacy ? "Mostrar valores" : "Esconder valores"} onPress={() => setPrivacy(!privacy)} />
            <IconButton icon="add" label="Lançar gasto" filled onPress={() => router.push("/lancar")} />
          </>
        }
      />
      {error ? <ErrorText message={error} /> : null}

      {!view ? (
        <Card>
          <Empty title="Ainda sem faturas confirmadas" hint="Importe o PDF da fatura do cartão e confirme para ver o painel do mês." />
          <Button title="Importar fatura" onPress={() => router.push("/importar")} />
          <Button title="Lançar gasto (Pix, dinheiro…)" variant="secondary" onPress={() => router.push("/lancar")} />
        </Card>
      ) : (
        <>
          <Hero
            label="Total gasto"
            value={formatBRL(view.total)}
            top={
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.xs }}>
                <Pressable accessibilityLabel="Mês anterior" disabled={idx === 0} onPress={() => setPicked(view.months[idx - 1]!)} hitSlop={12} style={{ opacity: idx === 0 ? 0.3 : 1 }}>
                  <Ionicons name="chevron-back" size={22} color={t.onPrimary} />
                </Pressable>
                <Text style={{ color: t.onPrimary, fontWeight: "700", fontSize: 16, textTransform: "capitalize" }}>{formatMonthLong(view.month)}</Text>
                <Pressable accessibilityLabel="Próximo mês" disabled={idx === view.months.length - 1} onPress={() => setPicked(view.months[idx + 1]!)} hitSlop={12} style={{ opacity: idx === view.months.length - 1 ? 0.3 : 1 }}>
                  <Ionicons name="chevron-forward" size={22} color={t.onPrimary} />
                </Pressable>
              </View>
            }
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {delta !== null ? (
                <HeroPill>{delta === 0 ? "= mês anterior" : `${delta > 0 ? "▲" : "▼"} ${view.prevTotal > 0 ? Math.round((Math.abs(delta) / view.prevTotal) * 100) : 0}% vs ${formatMonthShort(view.prev)}`}</HeroPill>
              ) : null}
              {ahead?.next ? <HeroPill>{`${formatMonthShort(ahead.next.monthKey)} previsto ${formatBRL(ahead.next.totalCents)}`}</HeroPill> : null}
            </View>
          </Hero>

          {view.reviewCount > 0 ? (
            <Card style={{ paddingVertical: 4 }}>
              <Row last onPress={() => router.push("/revisar")}>
                <Ionicons name="sparkles-outline" size={20} color={t.warning} />
                <Body style={{ flex: 1, fontWeight: "600" }}>{view.reviewCount} para revisar</Body>
                <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
              </Row>
            </Card>
          ) : null}

          {ahead && ahead.upcoming.length > 0 ? (
            <Card>
              <SectionTitle right={<Button title="Planejar" small variant="ghost" onPress={() => router.push("/planejar")} />}>Próximos gastos</SectionTitle>
              {ahead.upcoming.map((o) => (
                <View key={`${o.id}-${o.date}`} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                  <View style={{ width: 44, paddingVertical: 4, borderRadius: 10, backgroundColor: t.surfaceAlt, alignItems: "center" }}>
                    <Text style={{ color: t.text, fontWeight: "700", fontSize: 13, fontVariant: ["tabular-nums"] }}>{formatBrDayMonth(o.date)}</Text>
                  </View>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: o.categoryId ? categoryColor(t, o.categoryId) : t.planned }} />
                  <Body numberOfLines={1} style={{ flex: 1 }}>{o.description}</Body>
                  <Money cents={o.amountCents} bold />
                </View>
              ))}
            </Card>
          ) : null}

          {view.budgets.some((b) => b.level !== "ok") ? (
            <Card>
              <SectionTitle right={<Button title="Orçamento" small variant="ghost" onPress={() => router.push("/orcamento")} />}>Atenção ao orçamento</SectionTitle>
              {view.budgets.filter((b) => b.level !== "ok").slice(0, 4).map((b) => (
                <View key={b.categoryId} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
                  <Body numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{categoryName(b.categoryId)}</Body>
                  <Small>{formatBRL(b.spentCents)} / {formatBRL(b.limitCents)}</Small>
                  <Badge label={`${b.percent}%`} tone={b.level === "over100" ? "bad" : "warn"} />
                </View>
              ))}
            </Card>
          ) : null}

          <Card>
            <SectionTitle right={<Button title="Check-in" small variant="ghost" onPress={() => router.push("/checkin")} />}>Por categoria</SectionTitle>
            <CategoryDonut rows={view.byCategory} />
          </Card>

          <Card>
            <SectionTitle right={<Button title="Previsão" small variant="ghost" onPress={() => router.push("/planejar")} />}>Últimos 12 meses</SectionTitle>
            <MonthlyStackedBars series={view.series} selectedMonth={view.month} onSelect={setPicked} />
          </Card>

          <Card>
            <SectionTitle>O que mudou vs {formatMonthShort(view.prev)}</SectionTitle>
            {view.hasPrev ? <Changes changes={view.catChanges} newMerchants={view.merchantChanges.filter((c) => c.status === "novo")} /> : <Body muted>Sem fatura do mês anterior para comparar.</Body>}
          </Card>

          <Card>
            <SectionTitle>Onde mais gastou</SectionTitle>
            <HBars items={view.top.slice(0, 5).map((m) => ({ key: m.key, label: m.label, cents: m.totalCents, note: m.count > 1 ? `${m.count} compras` : undefined }))} />
          </Card>

          <Card>
            <SectionTitle>Meu × {partner?.display_name ?? "dela(e)"} × nosso</SectionTitle>
            <SplitBar
              parts={[
                { key: "me", label: "Meu", cents: view.split.mineCents, color: t.series[0]! },
                { key: "partner", label: partner?.display_name ?? "Dela(e)", cents: view.split.partnerCents, color: t.series[1]! },
                { key: "shared", label: "Nosso", cents: view.split.sharedCents, color: t.series[2]! },
              ]}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}

function Changes({ changes, newMerchants }: { changes: Change[]; newMerchants: Change[] }) {
  const t = useTheme();
  const rows = changes.filter((c) => c.status !== "igual").slice(0, 6);
  return (
    <View style={{ gap: space.sm }}>
      {rows.map((c) => (
        <View key={c.key} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }} accessible accessibilityLabel={`${c.label}: ${c.status}, ${formatBRL(c.diffCents)}`}>
          <View style={{ width: 62 }}>
            <Badge label={c.status === "novo" ? "Novo" : c.status === "sumiu" ? "Sumiu" : c.status === "subiu" ? "Subiu" : "Caiu"} tone={c.status === "subiu" || c.status === "novo" ? "warn" : "good"} />
          </View>
          <Body numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{c.label}</Body>
          <Money cents={c.diffCents} signed color={c.diffCents > 0 ? t.warning : t.success} />
        </View>
      ))}
      {newMerchants.length > 0 ? (
        <View style={{ gap: 4, paddingTop: space.sm }}>
          <Small>Estabelecimentos que apareceram pela 1ª vez ({newMerchants.length}):</Small>
          {newMerchants.slice(0, 5).map((m) => (
            <View key={m.key} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Body numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{m.label}</Body>
              <Money cents={m.currentCents} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
