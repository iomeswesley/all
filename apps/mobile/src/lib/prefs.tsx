import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance } from "react-native";
import { DEFAULT_REMINDER_LEAD, isReminderLead, type ReminderLeadDays } from "@financas/core";

export type ThemeChoice = "system" | "light" | "dark";

interface Prefs {
  theme: ThemeChoice;
  privacy: boolean;
  /** lembrete local antes de cada gasto futuro (ver lib/reminders.ts) */
  reminders: boolean;
  reminderLeadDays: ReminderLeadDays;
}

interface Ctx extends Prefs {
  setTheme: (t: ThemeChoice) => void;
  setPrivacy: (on: boolean) => void;
  setReminders: (on: boolean) => void;
  setReminderLeadDays: (d: ReminderLeadDays) => void;
}

const KEY = "prefs.v1";
const DEFAULTS: Prefs = { theme: "system", privacy: false, reminders: false, reminderLeadDays: DEFAULT_REMINDER_LEAD };
const PrefsContext = createContext<Ctx>({ ...DEFAULTS, setTheme: () => {}, setPrivacy: () => {}, setReminders: () => {}, setReminderLeadDays: () => {} });

/** Leitura síncrona do modo privacidade para a formatação de valores (ver lib/format.ts). */
export let privacyOn = false;

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const p = JSON.parse(raw) as Partial<Prefs>;
        const loaded: Prefs = { theme: p.theme === "light" || p.theme === "dark" ? p.theme : "system", privacy: Boolean(p.privacy), reminders: Boolean(p.reminders), reminderLeadDays: isReminderLead(p.reminderLeadDays) ? p.reminderLeadDays : DEFAULT_REMINDER_LEAD };
        privacyOn = loaded.privacy;
        setPrefs(loaded);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // faz diálogos, teclado e Switch nativos seguirem a escolha
    Appearance.setColorScheme(prefs.theme === "system" ? "unspecified" : prefs.theme);
  }, [prefs.theme]);

  const save = useCallback((next: Prefs) => {
    privacyOn = next.privacy;
    setPrefs(next);
    void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ...prefs, setTheme: (theme) => save({ ...prefs, theme }), setPrivacy: (privacy) => save({ ...prefs, privacy }), setReminders: (reminders) => save({ ...prefs, reminders }), setReminderLeadDays: (reminderLeadDays) => save({ ...prefs, reminderLeadDays }) }),
    [prefs, save],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export const usePrefs = () => useContext(PrefsContext);
