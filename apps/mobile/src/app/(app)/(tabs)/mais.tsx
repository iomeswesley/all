import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Switch, View } from "react-native";
import { Body, Button, Card, Chip, H1, Row, Screen, SectionTitle, Small } from "@/components/ui";
import { pushSupport, registerForPush } from "@/lib/push";
import { usePrefs } from "@/lib/prefs";
import { useReady, useSession } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

type Path =
  | "/recorrencias" | "/cartoes" | "/meu-casal" | "/orcamento" | "/checkin" | "/encargos"
  | "/habitos" | "/ir" | "/fluxo" | "/metas" | "/perguntas" | "/cartao" | "/lancar" | "/lancamentos" | "/regras" | "/contas" | "/seus-dados" | "/parcelas" | "/planejado" | "/busca" | "/mesada";

export default function Mais() {
  const t = useTheme();
  const router = useRouter();
  const { signOut } = useSession();
  const { me, householdName, user, householdId } = useReady();
  const { theme, setTheme, privacy, setPrivacy } = usePrefs();
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const support = pushSupport();

  const item = (icon: keyof typeof Ionicons.glyphMap, title: string, hint: string, path: Path, last = false) => (
    <Row onPress={() => router.push(path)} last={last}>
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

      <SectionTitle>Lançar</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {item("add-circle-outline", "Lançar gasto", "Pix, dinheiro, débito ou boleto na hora", "/lancar")}
        {item("list-outline", "Pix e dinheiro", "Ver, corrigir e excluir os lançamentos manuais", "/lancamentos", true)}
      </Card>

      <SectionTitle>Entender o gasto</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {item("clipboard-outline", "Check-in do mês", "Resumo e recomendações com economia em R$/mês", "/checkin")}
        {item("search-outline", "Lançamentos", "Buscar, filtrar e somar qualquer gasto", "/busca")}
        {item("chatbubble-ellipses-outline", "Pergunte aos dados", "“Quanto gastamos com restaurante desde julho?”", "/perguntas")}
        {item("cafe-outline", "Custo do hábito", "O que o café e a padaria custam por ano", "/habitos")}
        {item("repeat-outline", "Recorrências", "Assinaturas e cobranças mensais, custo anual", "/recorrencias")}
        {item("receipt-outline", "Encargos", "Anuidade, IOF, juros, multa e seguros", "/encargos", true)}
      </Card>

      <SectionTitle>Planejar</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {item("calendar-outline", "Gasto futuro", "IPVA, viagem, matrícula — entra na previsão", "/planejado")}
        {item("layers-outline", "Parcelas", "O que já está comprometido nos próximos meses", "/parcelas")}
        {item("lock-closed-outline", "Dinheiro livre", "Mesada pessoal 🔒 de cada um; o par vê só a %", "/mesada")}
        {item("speedometer-outline", "Orçamento", "Limite por categoria; aviso em 80% e 100%", "/orcamento")}
        {item("trending-up-outline", "Fluxo de caixa", "Quanto sobra nos próximos 6 meses", "/fluxo")}
        {item("flag-outline", "Metas", "Quanto guardar por mês para chegar lá", "/metas")}
        {item("document-text-outline", "Imposto de renda", "Saúde e educação, notas e exportação do ano", "/ir", true)}
      </Card>

      <SectionTitle>Cartão e casal</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {item("card-outline", "Monitor do cartão", "Melhor dia de compra, serviços em dólar e IOF", "/cartao")}
        {item("business-outline", "Contas e bancos", "Adicionar cartões e contas de outros bancos", "/contas")}
        {item("swap-horizontal-outline", "Cartões e donos", "De quem é cada cartão (meu / dela / nosso)", "/cartoes")}
        {item("git-branch-outline", "Regras", "O que o app aprendeu com suas correções", "/regras")}
        {item("people-outline", "Casal", `${householdName} · convidar parceiro(a)`, "/meu-casal", true)}
      </Card>

      <SectionTitle>Aparência</SectionTitle>
      <Card>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Chip label="Automático" selected={theme === "system"} onPress={() => setTheme("system")} />
          <Chip label="Claro" selected={theme === "light"} onPress={() => setTheme("light")} />
          <Chip label="Escuro" selected={theme === "dark"} onPress={() => setTheme("dark")} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Body>Modo privacidade</Body>
            <Small>Esconde todos os valores em R$ (bom para usar em público). Também no olho do painel.</Small>
          </View>
          <Switch value={privacy} onValueChange={setPrivacy} accessibilityLabel="Modo privacidade" />
        </View>
      </Card>

      <Card>
        <Body style={{ fontWeight: "600" }}>Notificações</Body>
        <Small>{support.supported ? "Avisos de orçamento (80% e 100%) e quando seu par confirma uma fatura." : support.reason}</Small>
        {support.supported ? <Button title="Ativar neste aparelho" variant="secondary" onPress={() => void registerForPush(householdId, user.id).then((r) => setPushMsg(r.message))} /> : null}
        {pushMsg ? <Small>{pushMsg}</Small> : null}
        <Small>Mesmo sem notificações, os alertas aparecem no painel e ao confirmar uma fatura.</Small>
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        {item("shield-checkmark-outline", "Seus dados", "Exportar, sair do casal, excluir casal ou conta", "/seus-dados", true)}
      </Card>
      <Card>
        <Body style={{ fontWeight: "600" }}>Privacidade dos dados</Body>
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
