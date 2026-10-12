import { useState } from "react";
import { Alert, View } from "react-native";
import { Body, Card, Chip, Empty, ErrorText, Loading, Screen, SectionTitle, Small } from "@/components/ui";
import { useLoad } from "@/lib/data";
import { useReady } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { space } from "@/lib/theme";

interface CardRow { account_id: string; last4: string; holder_user_id: string | null }

export default function Cartoes() {
  const { me, partner } = useReady();
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase.from("account_cards").select("account_id, last4, holder_user_id").order("last4");
    if (error) throw new Error(error.message);
    return (data ?? []) as CardRow[];
  });
  const [fail, setFail] = useState<string | null>(null);

  async function setHolder(card: CardRow, holder: string | null) {
    setFail(null);
    const { error } = await supabase.from("account_cards").update({ holder_user_id: holder }).eq("account_id", card.account_id).eq("last4", card.last4);
    if (error) return setFail("Não consegui salvar.");
    await reload();
    Alert.alert("Aplicar também às faturas já importadas?", "Os próximos lançamentos deste cartão já vão com esse dono. Quer atualizar os anteriores (menos os que você já corrigiu à mão)?", [
      { text: "Só daqui pra frente", style: "cancel" },
      {
        text: "Atualizar anteriores",
        onPress: () => {
          void supabase.from("transactions").update({ owner_user_id: holder }).eq("card_last4", card.last4).not("category_source", "in", "(rule,manual)").then(({ error }) => error && setFail("Não consegui atualizar os anteriores."));
        },
      },
    ]);
  }

  if (loading && !data) return <Screen><Loading /></Screen>;
  const label = (id: string | null) => (id === null ? "Nosso" : id === me.user_id ? "Meu" : partner?.display_name ?? "Dela(e)");
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Body muted>Cada cartão aparece na fatura pelos 4 últimos dígitos. Defina de quem é: os lançamentos dele entram como “meu”, “dela(e)” ou “nosso”.</Body>
      {error || fail ? <ErrorText message={(error ?? fail)!} /> : null}
      {data && data.length === 0 ? <Empty title="Nenhum cartão ainda" hint="Eles aparecem depois da primeira fatura importada." /> : null}
      {(data ?? []).map((c) => (
        <Card key={`${c.account_id}${c.last4}`}>
          <SectionTitle>Cartão final {c.last4}</SectionTitle>
          <Small>Dono atual: {label(c.holder_user_id)}</Small>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Chip label="Nosso" selected={c.holder_user_id === null} onPress={() => void setHolder(c, null)} />
            <Chip label="Meu" selected={c.holder_user_id === me.user_id} onPress={() => void setHolder(c, me.user_id)} />
            {partner ? <Chip label={partner.display_name} selected={c.holder_user_id === partner.user_id} onPress={() => void setHolder(c, partner.user_id)} /> : null}
          </View>
        </Card>
      ))}
      <Small>Dica: se o titular e o adicional aparecem em cartões diferentes na fatura, defina um dono para cada. Para separar gastos de um mesmo cartão, use “De quem é?” ao corrigir um lançamento.</Small>
    </Screen>
  );
}
