import { signedOutWidgetPayload } from "@financas/core";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { readStoredPayload } from "../storage";
import { ANDROID_WIDGET_NAME, renderPrevisto } from "./PrevistoAndroid";

/**
 * Roda em background (headless JS) quando o Android pede para desenhar o widget: ao adicionar,
 * redimensionar ou no ciclo de atualização. Não há app aberto, então lemos o último payload
 * que o app salvou (AsyncStorage) — nada de rede aqui.
 */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetInfo.widgetName !== ANDROID_WIDGET_NAME) return;
  if (widgetAction === "WIDGET_DELETED" || widgetAction === "WIDGET_CLICK") return; // cliques usam OPEN_URI direto
  const payload = (await readStoredPayload()) ?? signedOutWidgetPayload(new Date());
  renderWidget(renderPrevisto(payload));
}
