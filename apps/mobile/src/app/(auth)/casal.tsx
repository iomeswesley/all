import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { Body, Button, Card, ErrorText, H1, Screen, SectionTitle } from "@/components/ui";
import { PENDING_INVITE_KEY } from "@/lib/invite";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { radius, space, useTheme } from "@/lib/theme";

const ERRORS: Record<string, string> = {
  invite_not_found: "Convite não encontrado. Confira o código.",
  invite_used: "Este convite já foi usado.",
  invite_expired: "Este convite expirou. Peça um novo.",
  household_full: "Este casal já tem duas pessoas.",
  already_in_household: "Você já está em um casal.",
};
const explain = (message: string) => Object.entries(ERRORS).find(([k]) => message.includes(k))?.[1] ?? "Algo deu errado. Tente de novo.";

export default function Casal() {
  const t = useTheme();
  const router = useRouter();
  const { refresh, signOut } = useSession();
  const [name, setName] = useState("");
  const [casal, setCasal] = useState("Nossa casa");
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<{ household: string; inviter: string; valid: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 14, fontSize: 16, color: t.text, backgroundColor: t.surface } as const;

  useEffect(() => {
    void AsyncStorage.getItem(PENDING_INVITE_KEY).then((v) => v && setToken(v));
  }, []);

  useEffect(() => {
    setPreview(null);
    const tk = token.trim();
    if (tk.length < 32) return;
    void supabase.rpc("peek_invite", { p_token: tk }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : null;
      if (row) setPreview({ household: row.household_name, inviter: row.inviter_name, valid: row.valid });
    });
  }, [token]);

  async function create() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("create_household", { p_name: casal.trim() || "Nossa casa", p_display_name: name.trim() });
    if (error) setError(explain(error.message));
    else { await refresh(); router.replace("/"); }
    setBusy(false);
  }

  async function join() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("accept_invite", { p_token: token.trim(), p_display_name: name.trim() });
    if (error) setError(explain(error.message));
    else { await AsyncStorage.removeItem(PENDING_INVITE_KEY); await refresh(); router.replace("/"); }
    setBusy(false);
  }

  return (
    <Screen>
      <View style={{ gap: space.lg, paddingTop: space.lg }}>
        <H1>Vamos começar</H1>
        <Card>
          <SectionTitle>Como você quer ser chamado(a)?</SectionTitle>
          <TextInput style={input} placeholder="Seu nome" placeholderTextColor={t.textMuted} value={name} onChangeText={setName} maxLength={40} accessibilityLabel="Seu nome" />
        </Card>

        <Card>
          <SectionTitle>Recebi um convite</SectionTitle>
          <TextInput style={input} placeholder="Cole o código do convite" placeholderTextColor={t.textMuted} autoCapitalize="none" autoCorrect={false} value={token} onChangeText={setToken} accessibilityLabel="Código do convite" />
          {preview ? (
            <Body muted>{preview.valid ? `Entrar no casal “${preview.household}”, convidado por ${preview.inviter}.` : "Este convite não está mais válido."}</Body>
          ) : null}
          <Button title="Entrar no casal" onPress={join} loading={busy} disabled={!name.trim() || token.trim().length < 32 || preview?.valid === false} />
        </Card>

        <Card>
          <SectionTitle>Criar o nosso casal</SectionTitle>
          <TextInput style={input} placeholder="Nome do casal" placeholderTextColor={t.textMuted} value={casal} onChangeText={setCasal} maxLength={80} accessibilityLabel="Nome do casal" />
          <Body muted>Depois você convida seu par por link, em Mais → Casal.</Body>
          <Button title="Criar casal" variant="secondary" onPress={create} loading={busy} disabled={!name.trim()} />
        </Card>

        {error ? <ErrorText message={error} /> : null}
        <Button title="Sair" variant="ghost" onPress={signOut} />
      </View>
    </Screen>
  );
}
