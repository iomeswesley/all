import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance } from "react-native";

export type ThemeChoice = "system" | "light" | "dark";

interface Prefs {
  theme: ThemeChoice;
  privacy: boolean;
}

interface Ctx extends Prefs {
  setTheme: (t: ThemeChoice) => void;
  setPrivacy: (on: boolean) => void;
}

const KEY = "prefs.v1";
const PrefsContext = createContext<Ctx>({ theme: "system", privacy: false, setTheme: () => {}, setPrivacy: () => {} });

/** Leitura síncrona do modo privacidade para a formatação de valores (ver lib/format.ts). */
export let privacyOn = false;

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>({ theme: "system", privacy: false });

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const p = JSON.parse(raw) as Partial<Prefs>;
        const loaded: Prefs = { theme: p.theme === "light" || p.theme === "dark" ? p.theme : "system", privacy: Boolean(p.privacy) };
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
    () => ({ ...prefs, setTheme: (theme) => save({ ...prefs, theme }), setPrivacy: (privacy) => save({ ...prefs, privacy }) }),
    [prefs, save],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export const usePrefs = () => useContext(PrefsContext);
