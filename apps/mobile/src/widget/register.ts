/* eslint-disable @typescript-eslint/no-require-imports -- require preguiçoso proposital: ver native.ts */
import { widgetPlatform } from "./native";

/**
 * Registra o handler headless do widget Android. Chamado no entry (index.ts), antes do
 * expo-router: quando o Android acorda o JS só para desenhar o widget, nenhuma tela é montada.
 * No Expo Go / iOS / web não faz nada.
 */
export function registerWidgetTask(): void {
  if (widgetPlatform() !== "android") return;
  try {
    const { registerWidgetTaskHandler } = require("react-native-android-widget") as typeof import("react-native-android-widget");
    const { widgetTaskHandler } = require("./android/task-handler") as typeof import("./android/task-handler");
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (e) {
    if (__DEV__) console.warn("[widget] não registrei o handler Android", e);
  }
}
