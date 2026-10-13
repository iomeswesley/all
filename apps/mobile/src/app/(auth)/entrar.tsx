import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { Body, Button, Card, ErrorText, H1, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { radius, space, useTheme } from "@/lib/theme";

/** Login sem senha: o Supabase manda um código numérico por e-mail. */
export default function Entrar() {
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = {
    borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 14, fontSize: 17, color: t.text, backgroundColor: t.surface,
  } as const;

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) {
      const motivo = error.status === 429 ? " Muitas tentativas: aguarde um minuto." : ` (${error.message})`;
      setError(`Não consegui enviar o código.${motivo}`);
    } else setSent(true);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError("Código inválido ou expirado.");
    else router.replace("/");
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ gap: space.lg, paddingTop: space.xl }}>
          <H1>Finanças do casal</H1>
          <Body muted>Entre com seu e-mail. Enviamos um código — sem senha para lembrar.</Body>
          <Card>
            <TextInput
              style={input}
              placeholder="seu@email.com"
              placeholderTextColor={t.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              editable={!sent}
              accessibilityLabel="E-mail"
            />
            {sent ? (
              <>
                <TextInput
                  style={[input, { letterSpacing: 4, textAlign: "center", fontSize: 22 }]}
                  placeholder="000000"
                  placeholderTextColor={t.textMuted}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={10}
                  value={code}
                  onChangeText={setCode}
                  accessibilityLabel="Código de acesso"
                />
                <Button title="Entrar" onPress={verify} loading={busy} disabled={code.trim().length < 6} />
                <Button title="Usar outro e-mail" variant="ghost" onPress={() => { setSent(false); setCode(""); }} />
              </>
            ) : (
              <Button title="Enviar código" onPress={sendCode} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} />
            )}
            {error ? <ErrorText message={error} /> : null}
          </Card>
          <Body muted style={{ fontSize: 13 }}>
            Seus dados ficam no seu projeto Supabase, protegidos por regras de acesso por casal. Nenhum dado financeiro vai para serviços de IA.
          </Body>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

