import { useRouter } from "expo-router";
import { useState } from "react";
import { Share, TextInput, View } from "react-native";
import { JSON_IMPORT_PROMPT, parseJsonImport } from "@financas/core";
import { Banner, Body, Button, Card, Chip, ErrorText, H1, Loading, Screen, SectionTitle, Small } from "@/components/ui";
import { fetchAccounts } from "@/lib/accounts";
import { useLoad } from "@/lib/data";
import { describeResult, uploadAndParse } from "@/lib/importer";
import { useReady } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

/** Importação assistida: o seu Claude lê a fatura (PDF/foto) e devolve um JSON; o app valida, confere e importa. */
export default function ImportarJson() {
  const t = useTheme();
  const router = useRouter();
  const { householdId } = useReady();
  const accounts = useLoad(fetchAccounts);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importable = (accounts.data ?? []).filter((a) => !a.isCash);
  const accountId = picked && importable.some((a) => a.id === picked) ? picked : (importable.find((a) => a.kind === "credit_card") ?? importable[0])?.id;

  // validação local imediata (o mesmo código do servidor): erros claros antes de enviar
  let preview: { count: number; total: number | null; closing: string } | null = null;
  let problem: string | null = null;
  if (text.trim().length > 2) {
    try {
      const p = parseJsonImport(text);
      preview = { count: p.transactions.length, total: p.hasDeclaredTotals ? p.totalDueCents : null, closing: p.closingDate };
    } catch (e) {
      problem = (e as Error).message;
    }
  }

  async function submit() {
    if (!accountId || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const body = new TextEncoder().encode(text.trim());
      const { response } = await uploadAndParse({ householdId, accountId, fileName: "importacao.json", body });
      const r = describeResult(response);
      if (r.message) setError(r.message);
      if (r.open) router.replace({ pathname: "/fatura/[id]", params: { id: r.open } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 12, fontSize: 13, color: t.text, backgroundColor: t.surface, minHeight: 180, textAlignVertical: "top" as const, fontFamily: "monospace" };

  if (accounts.loading && !accounts.data) return <Screen><Loading /></Screen>;
  return (
    <Screen>
      <H1>Importação assistida</H1>
      <Body muted>Para bancos sem leitor nem OFX. Você usa o seu próprio Claude uma vez por fatura; o app nunca chama IA.</Body>

      <Card>
        <SectionTitle>1. Peça o JSON ao seu Claude</SectionTitle>
        <Body muted>Anexe o PDF ou a foto da fatura no seu Claude e envie estas instruções.</Body>
        <Button title="Compartilhar instruções" variant="secondary" onPress={() => void Share.share({ message: JSON_IMPORT_PROMPT })} />
      </Card>

      <Card>
        <SectionTitle>2. Cole a resposta aqui</SectionTitle>
        {importable.length > 1 ? (
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {importable.map((a) => <Chip key={a.id} label={a.name} selected={a.id === accountId} onPress={() => setPicked(a.id)} />)}
          </View>
        ) : null}
        <TextInput style={input} multiline placeholder='{ "version": 1, "closingDate": "2026-09-30", ... }' placeholderTextColor={t.textMuted} autoCapitalize="none" autoCorrect={false} value={text} onChangeText={setText} accessibilityLabel="JSON da fatura" />
        {problem ? <ErrorText message={problem} /> : null}
        {preview ? (
          <Banner tone={preview.total === null ? "warn" : "good"} title={`${preview.count} lançamentos lidos`}>
            <Small>{preview.total === null ? "Sem total declarado: não consigo conferir a soma. Confira os valores na próxima tela." : "Com total declarado: vou conferir a soma antes de salvar."}</Small>
          </Banner>
        ) : null}
        {error ? <ErrorText message={error} /> : null}
        <Button title="Importar" onPress={() => void submit()} loading={busy} disabled={!preview || !accountId} />
        {!accountId ? <Small>Crie uma conta em Mais → Contas e bancos primeiro.</Small> : null}
      </Card>
      <Small>Confira sempre alguns lançamentos: a IA pode errar uma leitura. Quando você informa o total da fatura, o app trava se a soma não bater.</Small>
    </Screen>
  );
}
