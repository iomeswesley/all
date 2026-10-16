import { requireOptionalNativeModule } from "expo";
import { NativeModules, Platform, TurboModuleRegistry } from "react-native";

/**
 * Detecta se o código nativo do widget está no binário. No Expo Go (e na web) não está:
 * nada de widget é carregado e tudo vira no-op. Os pacotes expo-widgets / react-native-android-widget
 * NUNCA são importados no topo de um módulo do app — só por require preguiçoso depois desta checagem,
 * porque importá-los sem o nativo quebraria o Expo Go (TurboModuleRegistry.getEnforcing / requireNativeModule).
 */
export type WidgetPlatform = "ios" | "android" | null;

let cached: WidgetPlatform | undefined;

export function widgetPlatform(): WidgetPlatform {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    if (Platform.OS === "ios" && requireOptionalNativeModule("ExpoWidgets")) cached = "ios";
    else if (Platform.OS === "android" && (TurboModuleRegistry.get("AndroidWidget") ?? NativeModules.AndroidWidget)) cached = "android";
  } catch {
    cached = null;
  }
  return cached;
}
