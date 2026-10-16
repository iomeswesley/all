import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, Switch, View } from "react-native";
import { formatBrDayMonth, MONEY_DATE_MINUTES, nextMoneyDate, shouldSuggestMoneyDate, suggestAfterDay, WEEKDAY_LONG, type Weekday } from "@financas/core";
import { Body, Card, Row, Segmented, Small } from "@/components/ui";
import { latestStatementMonth, type Analysis } from "@/lib/analysis";
import { useLoad } from "@/lib/data";
import { ensureMoneyDatePermission, fetchMoneyDates, setAutoAfterDay, setMoneyDatePrefs, useMoneyDatePrefs } from "@/lib/money-date";
import { space, useTheme } from "@/lib/theme";
import { localToday } from "@/lib/today";

/** Dia seguinte ao vencimento da última fatura confirmada. */
export function lastDueDate(a: Pick<Analysis, "statements">): string | null {
  return a.statements.filter((s) => s.status === "confirmed").map((s) => s.due_date).sort().at(-1) ?? null;
}

/** Atalho de uma linha no Início: aparece no começo do mês enquanto o encontro não foi feito. */
export function MoneyDateShortcut({ analysis }: { analysis: Analysis | null }) {
  const t = useTheme();
  const router = useRouter();
  const history = useLoad(fetchMoneyDates);
  const month = analysis ? latestStatementMonth(analysis) : undefined;
  const due = analysis ? lastDueDate(analysis) : null;
  useEffect(() => {
    if (due) setAutoAfterDay(suggestAfterDay(due));
  }, [due]);
  const show = useMemo(() => {
    if (!history.data) return false;
    const done = new Set(history.data.filter((r) => r.completedAt).map((r) => r.month));
    return shouldSuggestMoneyDate(localToday(), month, done);
  }, [history.data, month]);
  if (!show) return null;
  return (
    <Card style={{ paddingVertical: 4 }}>
      <Row last onPress={() => router.push("/encontro")}>
        <Ionicons name="heart-circle-outline" size={22} color={t.primary} />
        <Body style={{ flex: 1, fontWeight: "600" }}>Encontro do dinheiro · {MONEY_DATE_MINUTES} min</Body>
        <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
      </Row>
    </Card>
  );
}

const WEEKDAYS: Weekday[] = [5, 6, 0];
const WEEKDAY_LABEL: Record<number, string> = { 5: "Sexta", 6: "Sábado", 0: "Domingo" };
type When = "auto" | "1" | "15";

/** Lembrete mensal local do encontro (por aparelho). */
export function MoneyDateReminderCard() {
  const p = useMoneyDatePrefs();
  const [msg, setMsg] = useState<string | null>(null);
  if (Platform.OS === "web") return null;

  async function toggle(on: boolean) {
    setMsg(null);
    if (!on) return setMoneyDatePrefs({ enabled: false });
    const ok = await ensureMoneyDatePermission().catch(() => false);
    if (ok) setMoneyDatePrefs({ enabled: true });
    else setMsg("Permissão negada. Ative as notificações nas configurações do celular.");
  }

  const next = nextMoneyDate(localToday(), p.schedule);
  const when: When = p.afterDay === null ? "auto" : p.afterDay === 1 ? "1" : "15";

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: "600" }}>Lembrar todo mês</Body>
          <Small>{p.enabled ? `Próximo: ${WEEKDAY_LONG[p.schedule.weekday]}, ${formatBrDayMonth(next)} às 10h` : "Um aviso neste celular. Ative também no do seu par."}</Small>
        </View>
        <Switch value={p.enabled} onValueChange={(on) => void toggle(on)} accessibilityLabel="Lembrar do encontro do dinheiro todo mês" />
      </View>
      {p.enabled ? (
        <>
          <Segmented options={WEEKDAYS.map((d) => ({ value: String(d), label: WEEKDAY_LABEL[d]! }))} value={String(p.weekday)} onChange={(v) => setMoneyDatePrefs({ weekday: Number(v) as Weekday })} />
          <Segmented
            options={[{ value: "auto", label: "Após a fatura" }, { value: "1", label: "Início do mês" }, { value: "15", label: "Meio do mês" }]}
            value={when}
            onChange={(v: When) => setMoneyDatePrefs({ afterDay: v === "auto" ? null : Number(v) })}
          />
        </>
      ) : null}
      {msg ? <Small>{msg}</Small> : null}
    </Card>
  );
}
