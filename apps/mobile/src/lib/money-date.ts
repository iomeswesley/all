import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import {
  cancelReminder, DEFAULT_MONEY_DATE_SCHEDULE, MONEY_DATE_ID_PREFIX, moneyDateReminders, normalizeAgreements, splitFireAt,
  type MoneyDateRecord, type MoneyDateReminder, type MoneyDateSchedule, type Weekday,
} from "@financas/core";
import { usePrefs } from "./prefs";
import { pushSupport } from "./push";
import { supabase } from "./supabase";

/**
 * Encontro do dinheiro: histórico e combinados no Supabase (tabela money_dates) e o lembrete
 * mensal como notificação LOCAL (mesmo padrão de lib/reminders.ts, com prefixo próprio
 * "money-date:" — nunca mexe nos "planned:"). Ver docs/ENCONTRO-DINHEIRO.md.
 */

// ───────────── dados

export interface CancelItem { key: string; label: string; cents: number }
export interface MoneyDateRow extends MoneyDateRecord { toCancel: CancelItem[] }

interface Raw { month: string; agreements: unknown; to_cancel: unknown; completed_at: string | null }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const cancels = (v: unknown): CancelItem[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x.key === "string" && typeof x.label === "string").map((x) => ({ key: x.key, label: x.label, cents: Number(x.cents) || 0 })) : [];

export async function fetchMoneyDates(): Promise<MoneyDateRow[]> {
  const { data, error } = await supabase.from("money_dates").select("month, agreements, to_cancel, completed_at").order("month", { ascending: false }).limit(24);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Raw[]).map((r) => ({ month: r.month.slice(0, 7), agreements: strings(r.agreements), toCancel: cancels(r.to_cancel), completedAt: r.completed_at }));
}

export async function saveMoneyDate(householdId: string, userId: string, month: string, p: { agreements: string[]; toCancel: CancelItem[]; complete: boolean }) {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    household_id: householdId,
    month: `${month}-01`,
    agreements: normalizeAgreements(p.agreements),
    to_cancel: p.toCancel.slice(0, 20).map((c) => ({ key: c.key, label: c.label.slice(0, 80), cents: c.cents })),
    updated_at: now,
  };
  if (p.complete) Object.assign(row, { completed_at: now, completed_by: userId });
  const { error } = await supabase.from("money_dates").upsert(row, { onConflict: "household_id,month" });
  if (error) throw new Error(error.message);
}

// ───────────── preferência local do lembrete (por aparelho)

export interface MoneyDatePrefs {
  enabled: boolean;
  weekday: Weekday;
  /** null = automático (dia seguinte ao vencimento da última fatura, guardado em autoDay) */
  afterDay: number | null;
  autoDay: number;
}

const KEY = "moneyDate.v1";
let prefs: MoneyDatePrefs = { enabled: false, weekday: DEFAULT_MONEY_DATE_SCHEDULE.weekday, afterDay: null, autoDay: DEFAULT_MONEY_DATE_SCHEDULE.afterDay };
const listeners = new Set<() => void>();
let loaded = false;

const validDay = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 28;

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<MoneyDatePrefs>;
      const wd = Number(p.weekday);
      prefs = {
        enabled: Boolean(p.enabled),
        weekday: (Number.isInteger(wd) && wd >= 0 && wd <= 6 ? wd : DEFAULT_MONEY_DATE_SCHEDULE.weekday) as Weekday,
        afterDay: validDay(p.afterDay) ? p.afterDay! : null,
        autoDay: validDay(p.autoDay) ? p.autoDay! : DEFAULT_MONEY_DATE_SCHEDULE.afterDay,
      };
      for (const l of listeners) l();
    })
    .catch(() => {});
}

export function setMoneyDatePrefs(patch: Partial<MoneyDatePrefs>) {
  prefs = { ...prefs, ...patch };
  void AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
  for (const l of listeners) l();
  void syncMoneyDateReminders();
}

/** Dia automático: o seguinte ao vencimento da última fatura (as telas que têm as faturas chamam). */
export function setAutoAfterDay(day: number) {
  if (loaded && validDay(day) && day !== prefs.autoDay) setMoneyDatePrefs({ autoDay: day });
}

export const scheduleOf = (p: MoneyDatePrefs = prefs): MoneyDateSchedule => ({ weekday: p.weekday, afterDay: p.afterDay ?? p.autoDay });

const subscribe = (l: () => void) => {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => prefs;

export function useMoneyDatePrefs() {
  const p = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...p, schedule: scheduleOf(p) };
}

// ───────────── notificações locais

const CHANNEL_ID = "encontro";
let queue: Promise<unknown> = Promise.resolve();
let hideAmounts = false;
const supported = () => Platform.OS === "ios" || Platform.OS === "android";

function localNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function ensureMoneyDatePermission(): Promise<boolean> {
  if (!supported()) return false;
  const Notifications = await import("expo-notifications");
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function prepare(Notifications: typeof import("expo-notifications")) {
  if (!pushSupport().supported) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
    });
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: "Encontro do dinheiro", importance: Notifications.AndroidImportance.DEFAULT });
  }
}

async function schedule(Notifications: typeof import("expo-notifications"), r: MoneyDateReminder) {
  const { y, m, d, hh, mm } = splitFireAt(r.fireAt);
  await Notifications.scheduleNotificationAsync({
    identifier: r.id,
    content: { title: r.title, body: r.body, data: { route: "/encontro" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(y, m - 1, d, hh, mm), channelId: CHANNEL_ID },
  });
}

async function doSync(p: MoneyDatePrefs): Promise<number> {
  if (!supported()) return 0;
  const Notifications = await import("expo-notifications");
  const ours = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(MONEY_DATE_ID_PREFIX));
  await Promise.all(ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (!p.enabled || !(await Notifications.getPermissionsAsync()).granted) return 0;
  await prepare(Notifications);
  const list = moneyDateReminders({ now: localNow(), schedule: scheduleOf(p) });
  for (const r of list) await schedule(Notifications, r);
  return list.length;
}

/** Reagenda os 3 próximos lembretes do encontro (em fila; nunca lança). */
export function syncMoneyDateReminders(): Promise<number> {
  const p = prefs;
  const run = queue.then(() => doSync(p)).catch(() => 0);
  queue = run;
  return run;
}

/** "Cancelar" uma assinatura no encontro vira um lembrete local no dia seguinte, às 19h. */
export async function scheduleCancelReminder(item: CancelItem, today: string): Promise<boolean> {
  if (!supported()) return false;
  try {
    if (!(await ensureMoneyDatePermission())) return false;
    const Notifications = await import("expo-notifications");
    await prepare(Notifications);
    await schedule(Notifications, cancelReminder(item, today, hideAmounts));
    return true;
  } catch {
    return false;
  }
}

export async function unscheduleCancelReminder(key: string) {
  if (!supported()) return;
  const Notifications = await import("expo-notifications");
  await Notifications.cancelScheduledNotificationAsync(cancelReminder({ key, label: "", cents: 0 }, "2000-01-01").id).catch(() => {});
}

/** Monte uma vez na área logada: reagenda ao abrir e ao voltar para o app. */
export function useMoneyDateReminders(active: boolean) {
  const { privacy } = usePrefs();
  const { enabled, weekday, afterDay, autoDay } = useMoneyDatePrefs();
  useEffect(() => {
    hideAmounts = privacy;
  }, [privacy]);
  useEffect(() => {
    if (active && enabled) void syncMoneyDateReminders();
  }, [active, enabled, weekday, afterDay, autoDay]);
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && prefs.enabled) void syncMoneyDateReminders();
    });
    return () => sub.remove();
  }, [active]);
}
