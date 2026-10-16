import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { plannedReminders, REMINDER_ID_PREFIX, splitFireAt, type PlannedExpense, type ReminderLeadDays } from "@financas/core";
import { fetchPlanned } from "./planned";
import { usePrefs } from "./prefs";
import { pushSupport } from "./push";

/**
 * Lembretes de gasto futuro como notificações LOCAIS agendadas (expo-notifications).
 * Funcionam sem servidor e também no Expo Go (só o push remoto saiu do Expo Go no Android).
 * A cada sincronização cancelamos só os nossos (prefixo "planned:") e agendamos os próximos
 * (teto de 48 por causa do limite de 64 do iOS). Ver docs/LEMBRETES.md.
 */
export interface ReminderSettings {
  enabled: boolean;
  leadDays: ReminderLeadDays;
  hideAmounts: boolean;
}

const CHANNEL_ID = "lembretes";
let settings: ReminderSettings = { enabled: false, leadDays: 3, hideAmounts: false };
let queue: Promise<unknown> = Promise.resolve();
let handlerReady = false;

const supported = () => Platform.OS === "ios" || Platform.OS === "android";

function localNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Pede a permissão de notificação (ao ligar o lembrete). */
export async function ensureReminderPermission(): Promise<boolean> {
  if (!supported()) return false;
  const Notifications = await import("expo-notifications");
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function cancelOurs(Notifications: typeof import("expo-notifications")) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(all.filter((n) => n.identifier.startsWith(REMINDER_ID_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

async function doSync(items: readonly PlannedExpense[] | null, s: ReminderSettings): Promise<number> {
  if (!supported()) return 0;
  const Notifications = await import("expo-notifications");
  if (!s.enabled || !(await Notifications.getPermissionsAsync()).granted) {
    await cancelOurs(Notifications);
    return 0;
  }
  // busca antes de cancelar: sem rede, os lembretes já agendados continuam valendo
  const list = plannedReminders(items ?? (await fetchPlanned()), { now: localNow(), leadDays: s.leadDays, hideAmounts: s.hideAmounts });

  if (!handlerReady && !pushSupport().supported) {
    // com push ativo o handler já é registrado em lib/push.ts; aqui garante o banner com o app aberto
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
    });
  }
  handlerReady = true;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: "Lembretes de gastos futuros", importance: Notifications.AndroidImportance.DEFAULT });
  }

  await cancelOurs(Notifications);
  for (const r of list) {
    const { y, m, d, hh, mm } = splitFireAt(r.fireAt);
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, data: { route: "/planejar" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(y, m - 1, d, hh, mm), channelId: CHANNEL_ID },
    });
  }
  return list.length;
}

/**
 * Reagenda tudo (em fila, para duas chamadas seguidas não se atropelarem).
 * Sem `items`, busca os gastos futuros no Supabase. Nunca lança: lembrete é melhor esforço.
 */
export function syncPlannedReminders(items?: readonly PlannedExpense[]): Promise<number> {
  const s = settings;
  const run = queue.then(() => doSync(items ?? null, s)).catch(() => 0);
  queue = run;
  return run;
}

/** Monte uma vez dentro da área logada: reagenda ao abrir, ao voltar para o app e ao mudar a preferência. */
export function usePlannedReminders(active: boolean) {
  const { reminders, reminderLeadDays, privacy } = usePrefs();
  useEffect(() => {
    settings = { enabled: reminders, leadDays: reminderLeadDays, hideAmounts: privacy };
    if (active) void syncPlannedReminders();
  }, [active, reminders, reminderLeadDays, privacy]);
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && settings.enabled) void syncPlannedReminders();
    });
    return () => sub.remove();
  }, [active]);
}
