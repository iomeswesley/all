import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Body, Card, Row, Small } from "@/components/ui";
import { useLoad } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { useReady } from "@/lib/session";
import { fetchSplitView } from "@/lib/split";
import { useTheme } from "@/lib/theme";

/** Cartão compacto do Início: aparece só quando há saldo entre o casal. */
export function SplitHomeCard() {
  const t = useTheme();
  const router = useRouter();
  const { me, partner } = useReady();
  const { data } = useLoad(() => fetchSplitView(me, partner), [me.user_id, partner?.user_id]);
  const debt = data?.result.debt;
  if (!partner || !debt) return null;
  const iOwe = debt.fromUserId === me.user_id;
  const text = iOwe ? `Você deve ${formatBRL(debt.amountCents)} a ${partner.display_name}` : `${partner.display_name} deve ${formatBRL(debt.amountCents)} a você`;
  return (
    <Card style={{ paddingVertical: 4 }}>
      <Row last onPress={() => router.push("/acerto")}>
        <Ionicons name="swap-horizontal" size={20} color={iOwe ? t.warning : t.success} />
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: "600" }}>{text}</Body>
          <Small>Acerto do casal · toque para ver ou registrar</Small>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
      </Row>
    </Card>
  );
}
