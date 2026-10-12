import { Redirect, Stack } from "expo-router";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const { state } = useSession();
  const t = useTheme();
  if (state.status === "loading") return null;
  if (state.status !== "ready") return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: t.surface }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
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
    </Stack>
  );
}
