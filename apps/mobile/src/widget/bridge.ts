/* eslint-disable @typescript-eslint/no-require-imports -- require preguiçoso proposital: ver native.ts */
import { signedOutWidgetPayload, type WidgetPayload } from "@financas/core";
import { widgetPlatform } from "./native";
import { storePayload } from "./storage";

/**
 * Ponte única entre o app e o widget de tela inicial. Sem módulo nativo (Expo Go, web) é no-op.
 * Nunca lança: falha no widget não pode atrapalhar a tela que chamou.
 */
let lastJson: string | null = null;

export function widgetSupported(): boolean {
  return widgetPlatform() !== null;
}

export async function publishWidget(payload: WidgetPayload): Promise<void> {
  const platform = widgetPlatform();
  if (!platform) return;
  // "Atualizado hh:mm" muda sempre; só redesenha se o conteúdo mudou
  const json = JSON.stringify({ ...payload, updatedLabel: "" });
  if (json === lastJson) return;
  lastJson = json;
  try {
    if (platform === "ios") {
      const widget = require("./ios/PrevistoWidget").default as { updateSnapshot: (p: WidgetPayload) => void } | null;
      widget?.updateSnapshot(payload);
    } else {
      await storePayload(payload);
      const { requestWidgetUpdate } = require("react-native-android-widget") as typeof import("react-native-android-widget");
      const { ANDROID_WIDGET_NAME, renderPrevisto } = require("./android/PrevistoAndroid") as typeof import("./android/PrevistoAndroid");
      await requestWidgetUpdate({ widgetName: ANDROID_WIDGET_NAME, renderWidget: () => renderPrevisto(payload) });
    }
  } catch (e) {
    lastJson = null;
    if (__DEV__) console.warn("[widget] falha ao atualizar", e);
  }
}

/** Ao sair da conta: tira os valores da tela inicial. */
export function clearWidget(): Promise<void> {
  return publishWidget(signedOutWidgetPayload(new Date()));
}
