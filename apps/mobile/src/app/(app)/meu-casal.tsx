import { useState } from "react";
import { Share, View } from "react-native";
import { Badge, Body, Button, Card, ErrorText, Row, Screen, SectionTitle, Small } from "@/components/ui";
import { inviteMessage } from "@/lib/invite";
import { useReady, useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

export default function MeuCasal() {
  const { householdName, me, members } = useReady();
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = me.role === "owner";
  const full = members.length >= 2;

  async function invite() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_invite", {});
    setBusy(false);
    if (error || typeof data !== "string") return setError("Não consegui criar o convite.");
    await Share.share({ message: inviteMessage(data, me.display_name) });
    await refresh();
  }

  return (
    <Screen>
      <Card>
        <SectionTitle>{householdName}</SectionTitle>
        {members.map((m, i) => (
          <Row key={m.user_id} last={i === members.length - 1}>
            <Body style={{ flex: 1 }}>{m.display_name}{m.user_id === me.user_id ? " (você)" : ""}</Body>
            <Badge label={m.role === "owner" ? "Dono(a)" : "Membro"} />
          </Row>
        ))}
      </Card>
      {isOwner && !full ? (
        <Card>
          <SectionTitle>Convidar</SectionTitle>
          <Body muted>Gera um link de uso único (vale 7 dias). Mande por WhatsApp ou e-mail. Quem receber entra, escolhe o nome e vê os mesmos dados.</Body>
          <Button title="Gerar e compartilhar convite" onPress={invite} loading={busy} />
          {error ? <ErrorText message={error} /> : null}
          <Small>Um novo convite cancela o anterior.</Small>
        </Card>
      ) : null}
      {full ? (
        <View><Small>O casal está completo: os dois veem os mesmos lançamentos.</Small></View>
      ) : null}
    </Screen>
  );
}
