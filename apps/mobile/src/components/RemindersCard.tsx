import { useState } from "react";
import { Platform, Switch, View } from "react-native";
import { REMINDER_LEAD_OPTIONS, type ReminderLeadDays } from "@financas/core";
import { Body, Card, Segmented, Small } from "@/components/ui";
import { usePrefs } from "@/lib/prefs";
import { ensureReminderPermission } from "@/lib/reminders";
import { space } from "@/lib/theme";

const LABEL: Record<ReminderLeadDays, string> = { 1: "1 dia", 3: "3 dias", 7: "7 dias" };

/** Liga/desliga o lembrete local de gasto futuro e escolhe a antecedência. */
export function RemindersCard() {
  const { reminders, setReminders, reminderLeadDays, setReminderLeadDays } = usePrefs();
  const [msg, setMsg] = useState<string | null>(null);
  if (Platform.OS === "web") return null;

  async function toggle(on: boolean) {
    setMsg(null);
    if (!on) return setReminders(false);
    const ok = await ensureReminderPermission().catch(() => false);
    if (ok) setReminders(true);
    else setMsg("Permissão negada. Ative as notificações nas configurações do celular.");
  }

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: "600" }}>Lembrar antes</Body>
          <Small>{reminders ? `Aviso às 9h, ${reminderLeadDays === 1 ? "na véspera" : `${LABEL[reminderLeadDays]} antes`} e no dia.` : "Um aviso neste celular antes de cada gasto futuro."}</Small>
        </View>
        <Switch value={reminders} onValueChange={(on) => void toggle(on)} accessibilityLabel="Lembrar antes dos gastos futuros" />
      </View>
      {reminders ? (
        <Segmented
          options={REMINDER_LEAD_OPTIONS.map((d) => ({ value: String(d), label: LABEL[d] }))}
          value={String(reminderLeadDays)}
          onChange={(v) => setReminderLeadDays(Number(v) as ReminderLeadDays)}
        />
      ) : null}
      {msg ? <Small>{msg}</Small> : null}
    </Card>
  );
}
