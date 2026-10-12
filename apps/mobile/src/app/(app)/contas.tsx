import { useState } from "react";
import { Alert, Modal, TextInput, View } from "react-native";
import { Badge, Body, Button, Card, Chip, Empty, ErrorText, H1, Loading, Screen, SectionTitle, Small } from "@/components/ui";
import { createAccount, deleteAccount, fetchAccounts, INSTITUTIONS, renameAccount, type AccountRow } from "@/lib/accounts";
import { useLoad } from "@/lib/data";
import { useReady } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

type Draft = { id: string | null; name: string; institution: string; kind: AccountRow["kind"] };

export default function Contas() {
  const t = useTheme();
  const { householdId } = useReady();
  const { data, error, loading, reload } = useLoad(fetchAccounts);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);

  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 14, fontSize: 16, color: t.text, backgroundColor: t.surface } as const;
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setFail(null);
    try { await fn(); await reload(); } catch (e) { setFail((e as Error).message); } finally { setBusy(false); }
  }

  const save = () => run(async () => {
    if (!draft) return;
    if (draft.id) await renameAccount(draft.id, draft.name);
    else await createAccount(householdId, draft);
    setDraft(null);
  });

  const remove = (a: AccountRow) =>
    Alert.alert(
      `Excluir “${a.name}”?`,
      `Apaga ${a.statements} fatura${a.statements === 1 ? "" : "s"} importada${a.statements === 1 ? "" : "s"}, todos os lançamentos dessa conta e os arquivos enviados. Não dá para desfazer.`,
      [{ text: "Cancelar", style: "cancel" }, { text: "Excluir conta", style: "destructive", onPress: () => void run(() => deleteAccount(a.id)) }],
    );

  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={reload} refreshing={loading || busy}>
      <H1>Contas e bancos</H1>
      <Body muted>Cada conta ou cartão tem as próprias faturas. PDF só do Santander; para qualquer banco use OFX ou a importação assistida por JSON.</Body>
      <Button title="Adicionar conta ou cartão" onPress={() => setDraft({ id: null, name: "", institution: "Nubank", kind: "credit_card" })} />
      {error || fail ? <ErrorText message={(error ?? fail)!} /> : null}
      {data && data.length === 0 ? <Empty title="Nenhuma conta" /> : null}
      {(data ?? []).map((a) => (
        <Card key={a.id} style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: "700", fontSize: 16 }} numberOfLines={2}>{a.name}</Body>
              <Small>{a.isCash ? "Criada sozinha para Pix, dinheiro, débito e boleto" : `${a.kind === "credit_card" ? "Cartão" : "Conta corrente"} · ${a.institution} · ${a.statements} fatura${a.statements === 1 ? "" : "s"}`}</Small>
            </View>
            <Badge label={a.isCash ? "Manual" : a.kind === "credit_card" ? "Cartão" : "Conta"} />
          </View>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}><Button title="Renomear" small variant="secondary" onPress={() => setDraft({ id: a.id, name: a.name, institution: a.institution, kind: a.kind })} /></View>
            {!a.isCash ? <Button title="Excluir" small variant="ghost" onPress={() => remove(a)} /> : null}
          </View>
        </Card>
      ))}

      <Modal visible={draft !== null} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
        <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: t.surface, padding: space.lg, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
            {draft ? (
              <>
                <SectionTitle>{draft.id ? "Renomear conta" : "Nova conta ou cartão"}</SectionTitle>
                <TextInput style={input} placeholder="Nome (ex.: Nubank cartão)" placeholderTextColor={t.textMuted} value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} maxLength={60} accessibilityLabel="Nome da conta" />
                {!draft.id ? (
                  <>
                    <Small>Tipo</Small>
                    <View style={{ flexDirection: "row", gap: space.sm }}>
                      <Chip label="Cartão de crédito" selected={draft.kind === "credit_card"} onPress={() => setDraft({ ...draft, kind: "credit_card" })} />
                      <Chip label="Conta corrente" selected={draft.kind === "checking"} onPress={() => setDraft({ ...draft, kind: "checking" })} />
                    </View>
                    <Small>Banco</Small>
                    <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                      {INSTITUTIONS.map((i) => <Chip key={i} label={i} selected={draft.institution === i} onPress={() => setDraft({ ...draft, institution: i })} />)}
                    </View>
                  </>
                ) : null}
                {fail ? <ErrorText message={fail} /> : null}
                <Button title="Salvar" onPress={save} loading={busy} disabled={draft.name.trim().length < 2} />
                <Button title="Cancelar" variant="ghost" onPress={() => setDraft(null)} />
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
