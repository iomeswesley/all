import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { categoryName, formatBrDate, formatMonthLong, formatMonthShort, forecastMonths, plannedEnded, repeatSummary, type PlannedExpense } from "@financas/core";
import { TimelineBars, type TimelineBar } from "@/components/charts";
import { RemindersCard } from "@/components/RemindersCard";
import { Body, Button, Card, Empty, ErrorText, Header, Hero, HeroPill, IconButton, Loading, Row, Screen, SectionTitle, Small, Stat } from "@/components/ui";
import { latestStatementMonth, useAnalysis } from "@/lib/analysis";
import { useLoad } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { fetchSettings } from "@/lib/phase3";
import { fetchPlanned } from "@/lib/planned";
import { categoryColor, space, useTheme } from "@/lib/theme";
import { localToday } from "@/lib/today";

/** Evolução mês a mês + previsão dos próximos 6 meses (média do histórico + gastos planejados). */
export default function Planejar() {
  const t = useTheme();
  const router = useRouter();
  const analysis = useAnalysis();
  const planned = useLoad(fetchPlanned);
  const settings = useLoad(fetchSettings);
  const [picked, setPicked] = useState<string | null>(null);
  const today = localToday();

  const view = useMemo(() => {
    if (!analysis.data || !planned.data) return null;
    const last = latestStatementMonth(analysis.data);
    if (!last) return { forecast: null, bars: [] as TimelineBar[] };
    const forecast = forecastMonths({ txs: analysis.data.txs, lastMonth: last, planned: planned.data, today, incomeCents: settings.data?.monthlyIncomeCents ?? 0 });
    const bars: TimelineBar[] = [
      ...forecast.history.map((h) => ({ monthKey: h.monthKey, kind: "history" as const, actualCents: h.totalCents })),
      ...forecast.months.map((m) => ({ monthKey: m.monthKey, kind: "forecast" as const, baselineCents: m.baselineCents, plannedCents: m.plannedCents })),
    ];
    return { forecast, bars };
  }, [analysis.data, planned.data, settings.data, today]);

  const loading = (analysis.loading && !analysis.data) || (planned.loading && !planned.data);
  if (loading) return <Screen><Loading /></Screen>;

  const add = () => router.push("/planejado");
  const forecast = view?.forecast ?? null;
  const selected = picked ?? forecast?.months[0]?.monthKey ?? "";
  const fMonth = forecast?.months.find((m) => m.monthKey === selected) ?? null;
  const hIdx = forecast?.history.findIndex((h) => h.monthKey === selected) ?? -1;
  const hMonth = hIdx >= 0 ? forecast!.history[hIdx]! : null;
  const prevHistory = hIdx > 0 ? forecast!.history.slice(0, hIdx).reverse().find((h) => h.totalCents !== null) : undefined;
  const active = (planned.data ?? []).filter((p) => !plannedEnded(p, today));

  return (
    <Screen onRefresh={() => { void analysis.reload(); void planned.reload(); void settings.reload(); }} refreshing={analysis.loading}>
      <Header kicker="Próximos 6 meses" title="Planejar" right={<IconButton icon="add" label="Adicionar gasto futuro" filled onPress={add} />} />
      {analysis.error || planned.error ? <ErrorText message={(analysis.error ?? planned.error)!} /> : null}

      {!forecast ? (
        <Card>
          <Empty title="Sem histórico ainda" hint="Confirme uma fatura para ver a evolução e a previsão." />
          <Button title="Adicionar gasto futuro" variant="secondary" onPress={add} />
        </Card>
      ) : (
        <>
          {fMonth ? (
            <Hero label={`Previsto · ${formatMonthLong(fMonth.monthKey)}`} value={formatBRL(fMonth.totalCents)}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                <HeroPill>Média {formatBRL(fMonth.baselineCents)}</HeroPill>
                {fMonth.plannedCents > 0 ? <HeroPill>+ Planejado {formatBRL(fMonth.plannedCents)}</HeroPill> : null}
                {fMonth.netCents !== null ? <HeroPill>{fMonth.netCents >= 0 ? "Sobra" : "Falta"} {formatBRL(Math.abs(fMonth.netCents))}</HeroPill> : null}
              </View>
            </Hero>
          ) : hMonth ? (
            <Hero label={`Realizado · ${formatMonthLong(hMonth.monthKey)}`} value={hMonth.totalCents === null ? "—" : formatBRL(hMonth.totalCents)}>
              {hMonth.changePct !== null && prevHistory ? (
                <HeroPill>{hMonth.changePct >= 0 ? "▲" : "▼"} {Math.abs(hMonth.changePct)}% vs {formatMonthShort(prevHistory.monthKey)}</HeroPill>
              ) : null}
            </Hero>
          ) : null}

          <Card>
            <SectionTitle>Evolução e previsão</SectionTitle>
            <TimelineBars bars={view!.bars} selected={selected} onSelect={setPicked} />
          </Card>

          {fMonth && fMonth.planned.length > 0 ? (
            <Card style={{ paddingVertical: 4 }}>
              {fMonth.planned.map((o, i) => (
                <Row key={`${o.id}-${o.date}`} last={i === fMonth.planned.length - 1} onPress={() => router.push({ pathname: "/planejado", params: { id: o.id } })}>
                  <Dot color={o.categoryId ? categoryColor(t, o.categoryId) : t.planned} />
                  <View style={{ flex: 1 }}>
                    <Body numberOfLines={1} style={{ fontWeight: "600" }}>{o.description}</Body>
                    <Small>{formatBrDate(o.date)}{o.label ? ` · ${o.label}` : ""}</Small>
                  </View>
                  <Text style={{ color: t.text, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{formatBRL(o.amountCents)}</Text>
                </Row>
              ))}
            </Card>
          ) : null}

          <Card style={{ flexDirection: "row", gap: space.md }}>
            <Stat label={`Média ${forecast.basisMonths}m`} value={formatBRL(forecast.baselineCents)} />
            <Stat label="Próximos 6m" value={formatBRL(forecast.totalCents)} />
            <Stat label="Mês mais alto" value={forecast.peak ? formatMonthShort(forecast.peak.monthKey) : "—"} tone={forecast.peak && forecast.peak.plannedCents > 0 ? "warn" : undefined} />
          </Card>
        </>
      )}

      <SectionTitle right={active.length > 0 ? <Button title="Adicionar" small variant="ghost" onPress={add} /> : undefined}>Gastos futuros</SectionTitle>
      {active.length === 0 ? (
        <Card>
          <Empty title="Nada planejado" hint="IPVA, viagem, matrícula, presente… Some à previsão do mês." />
          <Button title="Adicionar gasto futuro" onPress={add} />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {active.map((p, i) => <PlannedRow key={p.id} p={p} last={i === active.length - 1} onPress={() => router.push({ pathname: "/planejado", params: { id: p.id } })} />)}
        </Card>
      )}
      {active.length > 0 ? <RemindersCard /> : null}
    </Screen>
  );
}

function PlannedRow({ p, last, onPress }: { p: PlannedExpense; last: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Row last={last} onPress={onPress}>
      <Dot color={p.categoryId ? categoryColor(t, p.categoryId) : t.planned} />
      <View style={{ flex: 1 }}>
        <Body numberOfLines={1} style={{ fontWeight: "600" }}>{p.description}</Body>
        <Small>{formatBrDate(p.firstDate)} · {repeatSummary(p)}{p.categoryId ? ` · ${categoryName(p.categoryId)}` : ""}</Small>
      </View>
      <Text style={{ color: t.text, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{formatBRL(p.amountCents)}</Text>
    </Row>
  );
}

const Dot = ({ color }: { color: string }) => <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />;
