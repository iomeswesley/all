import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { formatBrDate } from "@financas/core";
import { ShareBar, useInputStyle } from "@/components/SplitParts";
import { Banner, Body, Button, Card, Chip, ErrorText, Loading, Money, Screen, SectionTitle, Small } from "@/components/ui";
import { useLoad } from "@/lib/data";
import { useReady } from "@/lib/session";
import { fetchOverride, saveOverride, type OverrideInput } from "@/lib/split";
import { supabase } from "@/lib/supabase";
import { space } from "@/lib/theme";

type How = "rule" | "me" | "partner" | "custom";
type Payer = "auto" | "me" | "partner";

/** "Dividir diferente": exceção de um lançamento (100% de alguém, 70/30…) e "quem pagou". */
export default function Dividir() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const input = useInputStyle();
  const { me, partner, householdId } = useReady();
  const { data, error, loading } = useLoad(async () => {
    const [tx, override] = await Promise.all([
      supabase.from("transactions").select("id, description_clean, amount_cents, posted_on, owner_user_id, is_private, kind").eq("id", String(id)).single(),
      fetchOverride(String(id)),
    ]);
    if (tx.error) throw new Error("Lançamento não encontrado.");
    return { tx: tx.data as { id: string; description_clean: string; amount_cents: number; posted_on: string; owner_user_id: string | null; is_private: boolean; kind: string }, override };
  }, [id]);

  const [loadedFor, setLoadedFor] = useState<unknown>(null);
  const [how, setHow] = useState<How>("rule");
  const [myPct, setMyPct] = useState("50");
  const [payer, setPayer] = useState<Payer>("auto");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (data && loadedFor !== data) {
    setLoadedFor(data);
    const o = data.override;
    if (o?.shareUserId && o.sharePct !== null) {
      const mine = o.shareUserId === me.user_id ? o.sharePct : 100 - o.sharePct;
      setHow(mine === 100 ? "me" : mine === 0 ? "partner" : "custom");
      setMyPct(String(mine));
    }
    setPayer(o?.paidByUserId ? (o.paidByUserId === me.user_id ? "me" : "partner") : "auto");
  }

  if (!partner) return <Screen><Banner tone="warn" title="Sem par no casal"><Small>A divisão precisa de duas pessoas.</Small></Banner></Screen>;
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (!data) return <Screen><ErrorText message={error ?? "Lançamento não encontrado."} /></Screen>;

  const { tx } = data;
  const pct = Number(myPct);
  const pctOk = /^\d{1,3}$/.test(myPct.trim()) && pct >= 0 && pct <= 100;
  const blocked = tx.is_private || tx.kind === "pagamento";
  const ownerName = tx.owner_user_id === null ? null : tx.owner_user_id === me.user_id ? "você" : partner.display_name;

  async function save() {
    if (how === "custom" && !pctOk) return setMessage("Informe a sua parte de 0 a 100%.");
    const share: Pick<OverrideInput, "shareUserId" | "sharePct"> =
      how === "rule" ? { shareUserId: null, sharePct: null }
      : how === "me" ? { shareUserId: me.user_id, sharePct: 100 }
      : how === "partner" ? { shareUserId: partner!.user_id, sharePct: 100 }
      : { shareUserId: me.user_id, sharePct: pct };
    const paidByUserId = payer === "auto" ? null : payer === "me" ? me.user_id : partner!.user_id;
    setBusy(true);
    setMessage(null);
    try {
      await saveOverride(householdId, tx.id, { ...share, paidByUserId });
      router.back();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Body numberOfLines={2} style={{ fontWeight: "600", fontSize: 17 }}>{tx.description_clean}</Body>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Small>{formatBrDate(tx.posted_on)}{ownerName ? ` · de ${ownerName}` : " · nosso"}</Small>
          <Money cents={Number(tx.amount_cents)} bold style={{ fontSize: 20 }} />
        </View>
      </Card>

      {blocked ? (
        <Banner tone="warn" title={tx.is_private ? "Gasto pessoal 🔒" : "Pagamento da fatura"}>
          <Small>{tx.is_private ? "Gasto pessoal não entra na divisão do casal." : "Pagamentos não são gasto e não entram na divisão."}</Small>
        </Banner>
      ) : (
        <>
          <Card>
            <SectionTitle>Como dividir</SectionTitle>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              <Chip label={ownerName ? `Padrão (100% ${ownerName})` : "Regra do casal"} selected={how === "rule"} onPress={() => setHow("rule")} />
              <Chip label="100% meu" selected={how === "me"} onPress={() => setHow("me")} />
              <Chip label={`100% ${partner.display_name}`} selected={how === "partner"} onPress={() => setHow("partner")} />
              <Chip label="Outra proporção" selected={how === "custom"} onPress={() => setHow("custom")} />
            </View>
            {how === "custom" ? (
              <View style={{ gap: space.sm }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {[70, 60, 40, 30].map((p) => <Chip key={p} label={`${p}/${100 - p}`} selected={pctOk && pct === p} onPress={() => setMyPct(String(p))} />)}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <Body style={{ flex: 1 }}>Sua parte (%)</Body>
                  <TextInput style={[input, { width: 90, textAlign: "center" }]} keyboardType="number-pad" value={myPct} onChangeText={setMyPct} maxLength={3} accessibilityLabel="Sua parte em porcentagem" />
                </View>
                {pctOk ? <ShareBar left={pct} right={100 - pct} leftLabel="Você" rightLabel={partner.display_name} /> : null}
              </View>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>Quem pagou</SectionTitle>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              <Chip label="Automático" selected={payer === "auto"} onPress={() => setPayer("auto")} />
              <Chip label="Eu" selected={payer === "me"} onPress={() => setPayer("me")} />
              <Chip label={partner.display_name} selected={payer === "partner"} onPress={() => setPayer("partner")} />
            </View>
            <Small>Automático: dono do cartão; sem dono, quem importou a fatura; no Pix e dinheiro, quem lançou.</Small>
          </Card>

          {message ? <ErrorText message={message} /> : null}
          <Button title="Salvar" onPress={() => void save()} loading={busy} />
          <Button title="Cancelar" variant="ghost" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
