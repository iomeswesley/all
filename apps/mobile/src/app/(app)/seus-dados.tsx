import { useState } from "react";
import { Alert, Modal, TextInput, View } from "react-native";
import { Body, Button, Card, ErrorText, H1, Screen, SectionTitle, Small } from "@/components/ui";
import { deleteHousehold, deleteMyAccount, exportMyData, leaveHousehold, removeMember } from "@/lib/privacy";
import { useReady, useSession } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

type Confirm = { kind: "household" | "account"; word: string; title: string; body: string } | null;

/** Direitos sobre os dados (LGPD): exportar, sair, remover o par, excluir o casal e excluir a conta. */
export default function SeusDados() {
  const t = useTheme();
  const { refresh } = useSession();
  const { householdId, householdName, me, partner, members } = useReady();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [typed, setTyped] = useState("");

  const isOwner = me.role === "owner";
  const alone = members.length === 1;
  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 14, fontSize: 17, color: t.text, backgroundColor: t.surface } as const;

  async function run(fn: () => Promise<void>, done?: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      if (done) setNote(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const leave = () =>
    Alert.alert(
      "Sair do casal?",
      `Você deixa de ver os dados de “${householdName}” e seus gastos pessoais são apagados. ${partner?.display_name ?? "Seu par"} continua com o histórico${isOwner ? " e vira dono(a)" : ""}. Exporte seus dados antes, se quiser guardá-los.`,
      [{ text: "Cancelar", style: "cancel" }, { text: "Sair do casal", style: "destructive", onPress: () => void run(async () => { await leaveHousehold(); await refresh(); }) }],
    );

  const remove = () =>
    partner &&
    Alert.alert(
      `Remover ${partner.display_name}?`,
      `${partner.display_name} perde o acesso e os gastos pessoais dela(e) são apagados. O histórico do casal continua com você.`,
      [{ text: "Cancelar", style: "cancel" }, { text: "Remover", style: "destructive", onPress: () => void run(async () => { await removeMember(partner.user_id); await refresh(); }, "Removido.") }],
    );

  const doConfirmed = () => {
    if (!confirm) return;
    const kind = confirm.kind;
    setConfirm(null);
    void run(async () => {
      if (kind === "household") {
        await deleteHousehold(householdId, householdName);
        await refresh();
      } else {
        await deleteMyAccount();
      }
    });
  };

  return (
    <Screen>
      <H1>Seus dados</H1>
      <Body muted>Você decide o que fica guardado. Tudo aqui vale para os dados do app no Supabase do casal.</Body>
      {error ? <ErrorText message={error} /> : null}
      {note ? <Small>{note}</Small> : null}

      <Card>
        <SectionTitle>Exportar</SectionTitle>
        <Body muted>Gera um arquivo JSON com tudo o que você pode ver: contas, faturas, lançamentos, regras, orçamentos, metas. Gastos pessoais do seu par não entram.</Body>
        <Button title="Exportar meus dados" variant="secondary" loading={busy} onPress={() => void run(exportMyData)} />
      </Card>

      <Card>
        <SectionTitle>Casal</SectionTitle>
        {!alone ? <Button title="Sair do casal" variant="secondary" onPress={leave} /> : <Small>Você é a única pessoa do casal. Para encerrar, exclua o casal abaixo.</Small>}
        {isOwner && partner ? <Button title={`Remover ${partner.display_name}`} variant="secondary" onPress={remove} /> : null}
        {(isOwner || alone) ? (
          <Button
            title="Excluir o casal e todos os dados"
            variant="danger"
            onPress={() => { setTyped(""); setConfirm({ kind: "household", word: householdName, title: "Excluir o casal inteiro", body: `Apaga TUDO de “${householdName}” — faturas, PDFs, lançamentos, regras, metas — para as duas pessoas. Não dá para desfazer. Digite o nome do casal para confirmar.` }); }}
          />
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Sua conta</SectionTitle>
        <Body muted>Exclui seu acesso (e-mail e login). {alone ? "Como você é a única pessoa do casal, os dados do casal também são apagados." : `Você sai do casal e ${partner?.display_name ?? "seu par"} fica com o histórico; seus gastos pessoais são apagados.`}</Body>
        <Button
          title="Excluir minha conta"
          variant="danger"
          onPress={() => { setTyped(""); setConfirm({ kind: "account", word: "EXCLUIR", title: "Excluir minha conta", body: "Esta ação não pode ser desfeita. Digite EXCLUIR para confirmar." }); }}
        />
      </Card>

      <Small>O que fica de fora do app: os dados que você já exportou ou compartilhou, e e-mails que o Supabase tenha enviado.</Small>

      <Modal visible={confirm !== null} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={{ flex: 1, backgroundColor: "#000a", justifyContent: "center", padding: space.xl }}>
          <Card>
            <SectionTitle>{confirm?.title}</SectionTitle>
            <Body>{confirm?.body}</Body>
            <TextInput style={input} autoCapitalize={confirm?.kind === "account" ? "characters" : "none"} autoCorrect={false} placeholder={confirm?.word} placeholderTextColor={t.textMuted} value={typed} onChangeText={setTyped} accessibilityLabel="Confirmação" />
            <Button title="Excluir definitivamente" variant="danger" disabled={typed.trim().toLowerCase() !== (confirm?.word ?? "").trim().toLowerCase()} onPress={doConfirmed} />
            <Button title="Cancelar" variant="ghost" onPress={() => setConfirm(null)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
