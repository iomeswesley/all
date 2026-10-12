import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
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

/** Abre a tela certa quando a pessoa toca na notificação. Retorna a função de limpeza. */
export async function listenNotificationTaps(open: (route: string) => void): Promise<() => void> {
  if (!pushSupport().supported) return () => {};
  const Notifications = await import("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = (response.notification.request.content.data as { route?: string } | undefined)?.route;
    if (route) open(route);
  });
  return () => sub.remove();
}
