import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseWidgetPayload, type WidgetPayload } from "@financas/core";

/** Último payload publicado; o widget Android lê daqui quando o sistema pede para redesenhar. */
const KEY = "widget.payload.v1";

export async function readStoredPayload(): Promise<WidgetPayload | null> {
  try {
    return parseWidgetPayload(await AsyncStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export async function storePayload(p: WidgetPayload): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // sem armazenamento o widget só fica com o último desenho
  }
}
