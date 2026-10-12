import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  addMonthsToKey, budgetStatuses, categoryName, compareMonths, formatBRL, formatMonthLong, formatMonthShort, monthlySeries, splitByOwner, topMerchants, totalByCategory, totalSpent, type Change,
} from "@financas/core";
import { CategoryDonut, HBars, MonthlyStackedBars, SplitBar } from "@/components/charts";
import { Badge, Body, Button, Card, Empty, ErrorText, H1, Loading, Money, Screen, SectionTitle, Small } from "@/components/ui";
import { budgetsFor, useAnalysis } from "@/lib/analysis";
import { useReady } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

export default function Inicio() {
  const t = useTheme();
  const router = useRouter();
  const { me, partner, householdName } = useReady();
  const { data: analysis, error, loading, reload } = useAnalysis();
  const data = analysis?.txs ?? null;
  const [picked, setPicked] = useState<string | null>(null);

  const view = useMemo(() => {
    if (!data || data.length === 0) return null;
    const months = [...new Set(data.map((x) => x.statementMonth))].sort();
    const month = picked && months.includes(picked) ? picked : months[months.length - 1]!;
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
      <H1>{householdName}</H1>
      {error ? <ErrorText message={error} /> : null}

      {!view ? (
        <Card>
          <Empty title="Ainda sem faturas confirmadas" hint="Importe o PDF da fatura do cartão e confirme para ver o painel do mês." />
          <Button title="Importar fatura" onPress={() => router.push("/importar")} />
        </Card>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Pressable accessibilityLabel="Mês anterior" disabled={idx === 0} onPress={() => setPicked(view.months[idx - 1]!)} hitSlop={12} style={{ opacity: idx === 0 ? 0.3 : 1 }}>
                <Ionicons name="chevron-back" size={26} color={t.text} />
              </Pressable>
              <View style={{ alignItems: "center" }}>
                <Small>Fatura de</Small>
                <Body style={{ fontWeight: "700", fontSize: 17 }}>{formatMonthLong(view.month)}</Body>
              </View>
              <Pressable accessibilityLabel="Próximo mês" disabled={idx === view.months.length - 1} onPress={() => setPicked(view.months[idx + 1]!)} hitSlop={12} style={{ opacity: idx === view.months.length - 1 ? 0.3 : 1 }}>
                <Ionicons name="chevron-forward" size={26} color={t.text} />
              </Pressable>
            </View>
            <Text style={{ color: t.text, fontSize: 34, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{formatBRL(view.total)}</Text>
            {delta !== null ? (
              <Body muted>
                {delta === 0 ? "Igual ao mês anterior" : `${delta > 0 ? "▲" : "▼"} ${formatBRL(Math.abs(delta))} (${view.prevTotal > 0 ? Math.round((Math.abs(delta) / view.prevTotal) * 100) : 0}%) ${delta > 0 ? "a mais" : "a menos"} que ${formatMonthShort(view.prev)}`}
              </Body>
            ) : null}
          </Card>

          {view.reviewCount > 0 ? (
            <Card>
              <Body>{view.reviewCount} lançamentos deste mês sem categoria certa.</Body>
              <Button title="Revisar agora" small variant="secondary" onPress={() => router.push("/revisar")} />
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
            <SectionTitle>Últimos 12 meses</SectionTitle>
            <MonthlyStackedBars series={view.series} selectedMonth={view.month} onSelect={setPicked} />
          </Card>

          <Card>
            <SectionTitle>O que mudou vs {formatMonthShort(view.prev)}</SectionTitle>
            {view.hasPrev ? <Changes changes={view.catChanges} newMerchants={view.merchantChanges.filter((c) => c.status === "novo")} /> : <Body muted>Sem fatura do mês anterior para comparar.</Body>}
          </Card>

          <Card>
            <SectionTitle>Top 10 estabelecimentos</SectionTitle>
            <HBars items={view.top.map((m) => ({ key: m.key, label: m.label, cents: m.totalCents, note: m.count > 1 ? `${m.count} compras` : undefined }))} />
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
            <Small>Lançamentos sem dono contam como “nosso”. Defina o dono do cartão em Mais → Cartões.</Small>
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
