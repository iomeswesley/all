import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import { formatBrDate, formatMonthLong, statementMonthKey } from "@financas/core";
import { Badge, Body, Button, Card, Chip, Empty, ErrorText, H1, Loading, Row, Screen, SectionTitle, Small } from "@/components/ui";
import { fetchAccounts } from "@/lib/accounts";
import { fetchStatements, useLoad } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { describeResult, parse, uploadAndParse, type ImportResponse } from "@/lib/importer";
import { useReady } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

export default function Importar() {
  const t = useTheme();
  const router = useRouter();
  const { householdId } = useReady();
  const { data, loading, error, reload } = useLoad(async () => {
    const [statements, accounts] = await Promise.all([fetchStatements(), fetchAccounts()]);
    return { statements, accounts };
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ path: string; accountId: string } | null>(null);
  const [password, setPassword] = useState("");

  const importable = (data?.accounts ?? []).filter((a) => !a.isCash);
  const accountId = picked && importable.some((a) => a.id === picked) ? picked : (importable.find((a) => a.kind === "credit_card") ?? importable[0])?.id;
  const nameOf = (id: string) => data?.accounts.find((a) => a.id === id)?.name ?? "";

  function handle(res: ImportResponse, ctx: { path: string; accountId: string }) {
    const r = describeResult(res);
    if (r.needsPassword) {
      setPassword("");
      setPending(ctx);
      if (r.message) setMessage(r.message);
      return;
    }
    setMessage(r.message);
    if (r.open) router.push({ pathname: "/fatura/[id]", params: { id: r.open } });
    if (res.status === "ok") void reload();
  }

  async function pickAndUpload() {
    if (!accountId) return setMessage("Crie uma conta em Mais → Contas e bancos antes de importar.");
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setBusy("Enviando o arquivo…");
    setMessage(null);
    try {
      const body = await (await fetch(asset.uri)).arrayBuffer();
      setBusy("Lendo…");
      const { path, response } = await uploadAndParse({ householdId, accountId, fileName: asset.name, body });
      setBusy(null);
      handle(response, { path, accountId });
    } catch (e) {
      setBusy(null);
      setMessage((e as Error).message);
    }
  }

  async function retryWithPassword() {
    if (!pending) return;
    const ctx = pending;
    setPending(null);
    setBusy("Lendo…");
    try {
      handle(await parse(ctx.path, ctx.accountId, password), ctx);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 14, fontSize: 16, color: t.text, backgroundColor: t.surface } as const;

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <H1>Importar</H1>
      <Card>
        <Body>Envie a fatura em <Body style={{ fontWeight: "700" }}>PDF</Body> (Santander), ou o extrato em <Body style={{ fontWeight: "700" }}>OFX</Body> de qualquer banco. Quando há total na fatura, confiro se a soma bate antes de salvar.</Body>
        {importable.length > 1 ? (
          <>
            <Small>Para qual conta?</Small>
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              {importable.map((a) => <Chip key={a.id} label={a.name} selected={a.id === accountId} onPress={() => setPicked(a.id)} />)}
            </View>
          </>
        ) : null}
        <Button title="Escolher arquivo (PDF ou OFX)" onPress={pickAndUpload} loading={busy !== null} />
        <Button title="Outro banco sem OFX: colar JSON" variant="ghost" onPress={() => router.push("/importar-json")} />
        {busy ? <Small>{busy}</Small> : null}
        {message ? <ErrorText message={message} /> : null}
        <Small>O arquivo vai para um espaço privado do seu casal. Nada é enviado a serviços de IA.</Small>
      </Card>

      <SectionTitle>Faturas e extratos</SectionTitle>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorText message={error} /> : null}
      {data && data.statements.length === 0 ? <Empty title="Nada importado ainda" hint="Comece pela fatura mais recente." /> : null}
      {data && data.statements.length > 0 ? (
        <Card style={{ paddingVertical: 4 }}>
          {data.statements.map((s, i) => (
            <Row key={s.id} last={i === data.statements.length - 1} onPress={() => router.push({ pathname: "/fatura/[id]", params: { id: s.id } })}>
              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontWeight: "600" }}>{formatMonthLong(statementMonthKey(s.due_date))}</Body>
                <Small>{nameOf(s.account_id)} · {s.format === "santander_pdf" ? "vence" : "até"} {formatBrDate(s.due_date)} · {formatBRL(s.declared_total_cents)}</Small>
              </View>
              {s.status === "confirmed" ? <Badge label="Confirmada" tone="good" /> : s.reconcile_status === "fail" ? <Badge label="Não bate" tone="bad" /> : s.reconcile_status === "unverified" ? <Badge label="Sem conferência" tone="warn" /> : <Badge label="Conferir" tone="warn" />}
            </Row>
          ))}
        </Card>
      ) : null}

      <Modal visible={pending !== null} transparent animationType="fade" onRequestClose={() => setPending(null)}>
        <View style={{ flex: 1, backgroundColor: "#000a", justifyContent: "center", padding: space.xl }}>
          <Card>
            <SectionTitle>PDF protegido por senha</SectionTitle>
            <Small>A senha é usada só para abrir o arquivo agora e não é guardada.</Small>
            <TextInput style={input} secureTextEntry autoCapitalize="none" placeholder="Senha do PDF" placeholderTextColor={t.textMuted} value={password} onChangeText={setPassword} accessibilityLabel="Senha do PDF" />
            <Button title="Abrir" onPress={() => void retryWithPassword()} disabled={!password} />
            <Pressable onPress={() => setPending(null)} accessibilityRole="button"><Body muted style={{ textAlign: "center" }}>Cancelar</Body></Pressable>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
