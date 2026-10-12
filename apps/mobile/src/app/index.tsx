import { Redirect } from "expo-router";
import { Body, Card, H1, Loading, Screen } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function Index() {
  const { state } = useSession();
  switch (state.status) {
    case "loading":
      return <Screen><Loading /></Screen>;
    case "unconfigured":
      return (
        <Screen>
          <H1>Falta configurar o Supabase</H1>
          <Card>
            <Body>1. Crie um projeto gratuito em supabase.com.</Body>
            <Body>2. Copie apps/mobile/.env.example para apps/mobile/.env.</Body>
            <Body>3. Cole a URL do projeto e a chave anon (pública) em Project Settings → API.</Body>
            <Body>4. Reinicie com: npx expo start --clear</Body>
            <Body muted>O passo a passo completo está em docs/SETUP.md.</Body>
          </Card>
        </Screen>
      );
    case "signed_out":
      return <Redirect href="/entrar" />;
    case "no_household":
      return <Redirect href="/casal" />;
    case "ready":
      return <Redirect href="/(app)/(tabs)" />;
  }
}
