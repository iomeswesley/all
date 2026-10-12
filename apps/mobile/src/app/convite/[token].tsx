import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Loading, Screen } from "@/components/ui";
import { PENDING_INVITE_KEY } from "@/lib/invite";

/** Deep link do convite: guarda o código e segue o fluxo normal (login → tela do casal). */
export default function ConviteLink() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return setSaved(true);
    void AsyncStorage.setItem(PENDING_INVITE_KEY, String(token)).finally(() => setSaved(true));
  }, [token]);

  if (!saved) return <Screen><Loading /></Screen>;
  return <Redirect href="/" />;
}
