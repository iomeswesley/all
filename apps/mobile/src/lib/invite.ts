import * as Linking from "expo-linking";

export const PENDING_INVITE_KEY = "pending_invite_token";

/** Link do convite (esquema do app; em desenvolvimento no Expo Go vira exp://…). */
export function inviteLink(token: string): string {
  return Linking.createURL(`convite/${token}`);
}

export function inviteMessage(token: string, inviterName: string): string {
  return `${inviterName} te convidou para o app de finanças do casal.\n\nAbra o link: ${inviteLink(token)}\n\nOu cole este código no app: ${token}`;
}
