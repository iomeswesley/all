import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  buildCalendarMonth, categoryName, detectRecurring, expectedRecurringFrom, findCalendarDay, formatMonthLong, monthKey as monthOf,
  shiftCalendarMonth, splitIso, WEEKDAY_INITIALS, type CalendarDay, type CalendarEvent,
} from "@financas/core";
import { Body, Card, Empty, ErrorText, Hero, HeroPill, Loading, Row, Screen, Small } from "@/components/ui";
import { latestStatementMonth, useAnalysis } from "@/lib/analysis";
import { useLoad } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { fetchPlanned } from "@/lib/planned";
import { radius, space, useTheme, type Theme } from "@/lib/theme";
import { localToday } from "@/lib/today";

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Calendário do mês: dias dos gastos planejados (laranja) e das recorrências esperadas (primário). */
export default function Calendario() {
  const t = useTheme();
  const router = useRouter();
  const analysis = useAnalysis();
  const planned = useLoad(fetchPlanned);
  const today = localToday();
  const [month, setMonth] = useState(() => monthOf(today));
  const [picked, setPicked] = useState<string | null>(null);

  const recurring = useMemo(() => {
    const a = analysis.data;
    if (!a || a.txs.length === 0) return [];
    const latest = latestStatementMonth(a);
    if (!latest) return [];
    return expectedRecurringFrom(detectRecurring(a.txs, latest).items, a.txs);
  }, [analysis.data]);

  const cal = useMemo(() => buildCalendarMonth({ monthKey: month, planned: planned.data ?? [], recurring, today }), [month, planned.data, recurring, today]);

  const loading = (planned.loading && !planned.data) || (analysis.loading && !analysis.data);
  if (loading) return <Screen><Loading /></Screen>;

  const defaultDay = month === monthOf(today) ? today : cal.weeks.flat().find((d) => d.inMonth && d.events.length > 0)?.date ?? null;
  const selectedDate = picked && picked.startsWith(month) ? picked : defaultDay;
  const selected = selectedDate ? findCalendarDay(cal, selectedDate) : undefined;

  const go = (n: number) => { void Haptics.selectionAsync(); setPicked(null); setMonth((m) => shiftCalendarMonth(m, n)); };
  const pick = (d: CalendarDay) => {
    if (!d.inMonth) { go(d.date < `${month}-01` ? -1 : 1); setPicked(d.date); return; }
    void Haptics.selectionAsync();
    setPicked(d.date);
  };
  const open = (e: CalendarEvent) => {
    if (e.kind === "planned") router.push({ pathname: "/planejado", params: { id: e.id } });
    else router.push("/recorrencias");
  };

  return (
    <Screen onRefresh={() => { void analysis.reload(); void planned.reload(); }} refreshing={planned.loading}>
      {analysis.error || planned.error ? <ErrorText message={(planned.error ?? analysis.error)!} /> : null}

      <Hero label={`Previsto · ${formatMonthLong(month)}`} value={formatBRL(cal.totalCents)}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <HeroPill>Planejado {formatBRL(cal.plannedCents)}</HeroPill>
          <HeroPill>Recorrente {formatBRL(cal.recurringCents)}</HeroPill>
        </View>
      </Hero>

      <Card style={{ paddingHorizontal: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <NavButton icon="chevron-back" label="Mês anterior" onPress={() => go(-1)} />
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar para hoje" onPress={() => { setPicked(null); setMonth(monthOf(today)); }}>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: "700", textTransform: "capitalize" }}>{formatMonthLong(month)}</Text>
          </Pressable>
          <NavButton icon="chevron-forward" label="Próximo mês" onPress={() => go(1)} />
        </View>

        <View style={{ flexDirection: "row" }}>
          {WEEKDAY_INITIALS.map((w, i) => (
            <Text key={i} style={{ flex: 1, textAlign: "center", color: t.textMuted, fontSize: 12, fontWeight: "700" }}>{w}</Text>
          ))}
        </View>

        <View style={{ gap: 2 }}>
          {cal.weeks.map((week) => (
            <View key={week[0]!.date} style={{ flexDirection: "row" }}>
              {week.map((d) => <DayCell key={d.date} d={d} selected={d.date === selectedDate} onPress={() => pick(d)} />)}
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", justifyContent: "center", gap: space.lg }}>
          <Legend color={t.planned} label="Planejado" />
          <Legend color={t.primary} label="Recorrente" />
        </View>
      </Card>

      {selected ? (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4 }}>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: "700" }}>{dayTitle(selected.date, today)}</Text>
            {selected.totalCents > 0 ? <Text style={{ color: t.textSecondary, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{formatBRL(selected.totalCents)}</Text> : null}
          </View>
          {selected.events.length === 0 ? (
            <Card><Empty title="Dia livre" hint="Nada previsto para este dia." /></Card>
          ) : (
            <Card style={{ paddingVertical: 4 }}>
              {selected.events.map((e, i) => (
                <Row key={`${e.kind}-${e.id}`} last={i === selected.events.length - 1} onPress={() => open(e)}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: kindColor(t, e.kind) + "22" }}>
                    <Ionicons name={e.kind === "planned" ? "flag" : "repeat"} size={17} color={kindColor(t, e.kind)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body numberOfLines={1} style={{ fontWeight: "600" }}>{e.label}</Body>
                    <Small>{e.kind === "planned" ? "Planejado" : "Recorrente"}{e.note ? ` · ${e.note}` : ""}{e.categoryId ? ` · ${categoryName(e.categoryId)}` : ""}</Small>
                  </View>
                  <Text style={{ color: t.text, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{formatBRL(e.amountCents)}</Text>
                </Row>
              ))}
            </Card>
          )}
        </View>
      ) : cal.busyDays === 0 ? (
        <Card><Empty title="Mês tranquilo" hint="Sem gastos planejados nem recorrências previstas." /></Card>
      ) : null}
    </Screen>
  );
}

const kindColor = (t: Theme, k: CalendarEvent["kind"]) => (k === "planned" ? t.planned : t.primary);

function dayTitle(date: string, today: string): string {
  if (date === today) return "Hoje";
  const { y, m, d } = splitIso(date);
  return `${DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d}`;
}

function Legend({ color, label }: { color: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function NavButton({ icon, label, onPress }: { icon: "chevron-back" | "chevron-forward"; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: t.surfaceAlt, opacity: pressed ? 0.6 : 1 })}
    >
      <Ionicons name={icon} size={20} color={t.text} />
    </Pressable>
  );
}

function DayCell({ d, selected, onPress }: { d: CalendarDay; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  const hasPlanned = d.events.some((e) => e.kind === "planned");
  const hasRecurring = d.events.some((e) => e.kind === "recurring");
  const textColor = d.isToday ? t.onPrimary : d.inMonth ? t.text : t.textMuted;
  const a11y = `${d.day}${d.isToday ? ", hoje" : ""}${d.events.length ? `, ${d.events.length} ${d.events.length === 1 ? "previsto" : "previstos"}, ${formatBRL(d.totalCents)}` : ""}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1, aspectRatio: 1, maxHeight: 56, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: radius.sm,
        backgroundColor: selected && !d.isToday ? t.surfaceAlt : "transparent",
        borderWidth: selected ? StyleSheet.hairlineWidth * 2 : 0, borderColor: t.primary,
        opacity: pressed ? 0.6 : d.inMonth ? 1 : 0.35,
      })}
    >
      <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: d.isToday ? t.primaryFill : "transparent" }}>
        <Text style={{ color: textColor, fontSize: 15, fontWeight: d.isToday || d.events.length ? "700" : "500", fontVariant: ["tabular-nums"] }}>{d.day}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 3, height: 6 }}>
        {hasPlanned ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.planned }} /> : null}
        {hasRecurring ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.primary }} /> : null}
      </View>
    </Pressable>
  );
}
