import { Redirect, Stack } from "expo-router";
import { usePlannedReminders } from "@/lib/reminders";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const { state } = useSession();
  const t = useTheme();
  usePlannedReminders(state.status === "ready");
  if (state.status === "loading") return null;
  if (state.status !== "ready") return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerShadowVisible: false, headerTintColor: t.text, headerTitleStyle: { fontWeight: "700" }, contentStyle: { backgroundColor: t.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="fatura/[id]" options={{ title: "Conferir fatura" }} />
      <Stack.Screen name="recorrencias" options={{ title: "Recorrências" }} />
      <Stack.Screen name="cartoes" options={{ title: "Cartões e donos" }} />
      <Stack.Screen name="meu-casal" options={{ title: "Casal" }} />
      <Stack.Screen name="orcamento" options={{ title: "Orçamento" }} />
      <Stack.Screen name="checkin" options={{ title: "Check-in do mês" }} />
      <Stack.Screen name="encargos" options={{ title: "Encargos" }} />
      <Stack.Screen name="habitos" options={{ title: "Custo do hábito" }} />
      <Stack.Screen name="ir" options={{ title: "Imposto de renda" }} />
      <Stack.Screen name="fluxo" options={{ title: "Fluxo de caixa" }} />
      <Stack.Screen name="metas" options={{ title: "Metas" }} />
      <Stack.Screen name="perguntas" options={{ title: "Pergunte aos dados" }} />
      <Stack.Screen name="cartao" options={{ title: "Monitor do cartão" }} />
      <Stack.Screen name="lancar" options={{ title: "Lançar gasto", presentation: "modal" }} />
      <Stack.Screen name="planejado" options={{ title: "Gasto futuro", presentation: "modal" }} />
      <Stack.Screen name="calendario" options={{ title: "Calendário" }} />
      <Stack.Screen name="parcelas" options={{ title: "Parcelas" }} />
      <Stack.Screen name="lancamentos" options={{ title: "Pix e dinheiro" }} />
      <Stack.Screen name="regras" options={{ title: "Regras" }} />
      <Stack.Screen name="contas" options={{ title: "Contas e bancos" }} />
      <Stack.Screen name="importar-json" options={{ title: "Importação assistida" }} />
      <Stack.Screen name="seus-dados" options={{ title: "Seus dados" }} />
    </Stack>
  );
}
