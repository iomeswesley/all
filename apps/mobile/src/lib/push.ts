import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { CATEGORIZE_ACTIONS, CATEGORIZE_ACTIONS_ID, categoryFromAction, categoryName } from "@financas/core";
import { applyCategory } from "./mutations";
import { supabase } from "./supabase";

export interface PushSupport {
  supported: boolean;
  reason?: string;
  projectId?: string;
}

/**
 * Push remoto não funciona no Expo Go (Android, desde o SDK 53) e exige um aparelho real
 * e um projeto EAS (projectId). Fora disso o app segue normal, com avisos dentro dele.
 */
export function pushSupport(): PushSupport {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return { supported: false, reason: "O Expo Go não recebe notificações push. Elas funcionam num development build (veja docs/FASE2.md)." };
  }
  if (!Device.isDevice) return { supported: false, reason: "Notificações só funcionam em aparelho real, não no simulador." };
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { supported: false, reason: "Falta o projectId do EAS. Rode `npx eas-cli init` em apps/mobile." };
  return { supported: true, projectId };
}

export async function registerForPush(householdId: string, userId: string): Promise<{ ok: boolean; message: string }> {
  const support = pushSupport();
  if (!support.supported) return { ok: false, message: support.reason ?? "Não suportado." };
  const Notifications = await import("expo-notifications");

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Avisos do casal", importance: Notifications.AndroidImportance.DEFAULT });
  }
  const current = await Notifications.getPermissionsAsync();
  const final = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!final.granted) return { ok: false, message: "Permissão negada. Ative nas configurações do celular." };

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: support.projectId! });
  const { error } = await supabase
    .from("push_tokens")
    .upsert({ user_id: userId, household_id: householdId, token, platform: Platform.OS, updated_at: new Date().toISOString() }, { onConflict: "user_id,token" });
  if (error) return { ok: false, message: "Não consegui registrar este aparelho." };
  return { ok: true, message: "Notificações ativadas neste aparelho." };
}

type Notifications = typeof import("expo-notifications");
const HANDLED_KEY = "notifications.handled";

/**
 * Botão de categoria da notificação: classifica o lançamento sem abrir o app e avisa com uma notificação local.
 * Só age se o lançamento ainda estiver em "revisar" (idempotente).
 */
export async function categorizeFromNotification(txId: string, categoryId: number, notifications?: Notifications): Promise<boolean> {
  await supabase.auth.getSession(); // garante a sessão restaurada
  const { data } = await supabase.from("transactions").select("description_raw, description_clean, needs_review").eq("id", txId).maybeSingle();
  if (!data || !data.needs_review) return false;
  await applyCategory({ description: data.description_raw as string, txId, categoryId, ownerUserId: undefined, always: true });
  if (notifications) {
    await notifications.scheduleNotificationAsync({ content: { title: "Categorizado", body: `${data.description_clean as string} → ${categoryName(categoryId)}` }, trigger: null });
  }
  return true;
}

async function alreadyHandled(key: string): Promise<boolean> {
  const raw = (await AsyncStorage.getItem(HANDLED_KEY).catch(() => null)) ?? "[]";
  const list = JSON.parse(raw) as string[];
  if (list.includes(key)) return true;
  await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...list.slice(-49), key])).catch(() => {});
  return false;
}

async function handleResponse(notifications: Notifications, response: import("expo-notifications").NotificationResponse, open: (route: string) => void) {
  const data = response.notification.request.content.data as { route?: string; txId?: string } | undefined;
  const categoryId = categoryFromAction(response.actionIdentifier);
  if (categoryId !== null && data?.txId) {
    if (await alreadyHandled(`${response.notification.request.identifier}:${response.actionIdentifier}`)) return;
    await categorizeFromNotification(data.txId, categoryId, notifications).catch(() => {});
    return;
  }
  if (data?.route) open(data.route);
}

/** Registra os botões e escuta toques/ações. Retorna a função de limpeza. */
export async function listenNotificationTaps(open: (route: string) => void): Promise<() => void> {
  if (!pushSupport().supported) return () => {};
  const Notifications = await import("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
  await Notifications.setNotificationCategoryAsync(
    CATEGORIZE_ACTIONS_ID,
    CATEGORIZE_ACTIONS.map((a) => ({ identifier: a.identifier, buttonTitle: a.title, options: { opensAppToForeground: false } })),
  );
  const sub = Notifications.addNotificationResponseReceivedListener((response) => void handleResponse(Notifications, response, open));
  // ação tocada com o app fechado: a resposta fica guardada até a próxima abertura
  const last = Notifications.getLastNotificationResponse();
  if (last) {
    void handleResponse(Notifications, last, open).finally(() => Notifications.clearLastNotificationResponse());
  }
  return () => sub.remove();
}
