import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Alert, View } from "react-native";
import { Body, Button, Card, H1, Row, Screen, Small } from "@/components/ui";
import { useReady, useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function Mais() {
  const t = useTheme();
  const router = useRouter();
  const { signOut } = useSession();
  const { me, householdName, user } = useReady();
  const go = (path: "/recorrencias" | "/cartoes" | "/meu-casal") => () => router.push(path);
  const item = (icon: keyof typeof Ionicons.glyphMap, title: string, hint: string, onPress: () => void, last = false) => (
    <Row onPress={onPress} last={last}>
      <Ionicons name={icon} size={22} color={t.textSecondary} />
      <View style={{ flex: 1 }}>
        <Body style={{ fontWeight: "500" }}>{title}</Body>
        <Small>{hint}</Small>
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
    </Row>
  );
  return (
    <Screen>
      <H1>Mais</H1>
      <Card style={{ paddingVertical: 4 }}>
        {item("repeat-outline", "Recorrências", "Assinaturas e cobranças mensais, custo anual", go("/recorrencias"))}
        {item("card-outline", "Cartões e donos", "De quem é cada cartão (meu / dela / nosso)", go("/cartoes"))}
        {item("people-outline", "Casal", `${householdName} · convidar parceiro(a)`, go("/meu-casal"), true)}
      </Card>
      <Card>
        <Body style={{ fontWeight: "600" }}>Privacidade</Body>
        <Small>As faturas ficam num espaço privado do seu casal no Supabase. Guardamos só os 4 últimos dígitos dos cartões. Nenhum dado é enviado a serviços de IA.</Small>
      </Card>
      <Card>
        <Small>Conectado como {me.display_name} ({user.email})</Small>
        <Button
          title="Sair"
          variant="secondary"
          onPress={() => Alert.alert("Sair da conta?", "Você poderá entrar de novo com o código por e-mail.", [{ text: "Cancelar", style: "cancel" }, { text: "Sair", style: "destructive", onPress: () => void signOut() }])}
        />
        <Small>Versão {Constants.expoConfig?.version ?? "0.1.0"}</Small>
      </Card>
    </Screen>
  );
}
