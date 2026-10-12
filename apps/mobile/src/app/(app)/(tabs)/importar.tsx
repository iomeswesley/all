import * as DocumentPicker from "expo-document-picker";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import { formatBrDate, formatMonthLong, statementMonthKey } from "@financas/core";
import { Badge, Body, Button, Card, Empty, ErrorText, H1, Loading, Row, Screen, SectionTitle, Small } from "@/components/ui";
import { fetchStatements, useLoad } from "@/lib/data";
import { useReady } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { radius, space, useTheme } from "@/lib/theme";
import { formatBRL } from "@/lib/format";

interface ImportResponse {
  status?: "ok" | "duplicate_file" | "already_confirmed" | "unsupported";
  statementId?: string;
  message?: string;
  error?: string;
  confirmed?: boolean;
}

const MESSAGES: Record<string, string> = {
  password_required: "Este PDF tem senha.",
  wrong_password: "Senha incorreta. Tente de novo.",
  unreadable_pdf: "Não consegui abrir este PDF.",
  file_not_found: "O arquivo não chegou ao servidor. Tente de novo.",
};

export default function Importar() {
  const t = useTheme();
  const router = useRouter();
  const { householdId } = useReady();
  const { data, loading, error, reload } = useLoad(fetchStatements);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  async function parse(path: string, pwd?: string) {
    setBusy("Lendo a fatura…");
    setMessage(null);
    const { data, error } = await supabase.functions.invoke<ImportResponse>("parse-statement", { body: { path, password: pwd } });
    let res: ImportResponse | null = data;
    if (error) {
      // Erros HTTP (422 etc.) trazem o corpo da resposta no contexto.
      const ctx = (error as { context?: Response }).context;
      res = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
      if (!res) { setBusy(null); return setMessage("Não consegui falar com o servidor. Confira a internet e se a função foi publicada."); }
    }
    setBusy(null);
    if (!res) return;
    if (res.error === "password_required" || res.error === "wrong_password") {
      setPassword("");
      setPasswordFor(path);
      if (res.error === "wrong_password") setMessage(MESSAGES.wrong_password!);
      return;
    }
    if (res.error) return setMessage(MESSAGES[res.error] ?? "Algo deu errado ao ler a fatura.");
    if (res.status === "unsupported") return setMessage(`Este PDF não parece uma fatura Santander compatível. ${res.message ?? ""}`);
    if (res.status === "duplicate_file" && res.statementId) {
      setMessage("Esta fatura já foi enviada.");
      return router.push({ pathname: "/fatura/[id]", params: { id: res.statementId } });
    }
    if (res.status === "already_confirmed" && res.statementId) {
      setMessage("Já existe uma fatura confirmada para este vencimento.");
      return router.push({ pathname: "/fatura/[id]", params: { id: res.statementId } });
    }
    if (res.status === "ok" && res.statementId) {
      void reload();
      router.push({ pathname: "/fatura/[id]", params: { id: res.statementId } });
    }
  }

  async function pickAndUpload() {
    const picked = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy("Enviando o PDF…");
    setMessage(null);
    try {
      const body = await (await fetch(picked.assets[0].uri)).arrayBuffer();
      const path = `${householdId}/${randomUUID()}.pdf`;
      const up = await supabase.storage.from("statements").upload(path, body, { contentType: "application/pdf", upsert: false });
      if (up.error) throw up.error;
      await parse(path);
    } catch {
      setBusy(null);
      setMessage("Não consegui enviar o arquivo. Tente de novo.");
    }
  }

  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 14, fontSize: 16, color: t.text, backgroundColor: t.surface } as const;

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <H1>Importar fatura</H1>
      <Card>
        <Body>Envie o PDF da fatura do cartão Santander. Eu leio os lançamentos e confiro se a soma bate com o total antes de salvar.</Body>
        <Button title="Escolher PDF da fatura" onPress={pickAndUpload} loading={busy !== null} />
        {busy ? <Small>{busy}</Small> : null}
        {message ? <ErrorText message={message} /> : null}
        <Small>O arquivo vai para um espaço privado do seu casal. Nada é enviado a serviços de IA.</Small>
      </Card>

      <SectionTitle>Faturas</SectionTitle>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorText message={error} /> : null}
      {data && data.length === 0 ? <Empty title="Nenhuma fatura ainda" hint="Comece enviando a fatura mais recente." /> : null}
      {data && data.length > 0 ? (
        <Card style={{ paddingVertical: 4 }}>
          {data.map((s, i) => (
            <Row key={s.id} last={i === data.length - 1} onPress={() => router.push({ pathname: "/fatura/[id]", params: { id: s.id } })}>
              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontWeight: "600" }}>{formatMonthLong(statementMonthKey(s.due_date))}</Body>
                <Small>Vence {formatBrDate(s.due_date)} · {formatBRL(s.declared_total_cents)}</Small>
              </View>
              {s.status === "confirmed" ? <Badge label="Confirmada" tone="good" /> : <Badge label={s.reconcile_status === "fail" ? "Não bate" : "Conferir"} tone={s.reconcile_status === "fail" ? "bad" : "warn"} />}
            </Row>
          ))}
        </Card>
      ) : null}

      <Modal visible={passwordFor !== null} transparent animationType="fade" onRequestClose={() => setPasswordFor(null)}>
        <View style={{ flex: 1, backgroundColor: "#000a", justifyContent: "center", padding: space.xl }}>
          <Card>
            <SectionTitle>PDF protegido por senha</SectionTitle>
            <Small>A senha é usada só para abrir o arquivo agora e não é guardada.</Small>
            <TextInput style={input} secureTextEntry autoCapitalize="none" placeholder="Senha do PDF" placeholderTextColor={t.textMuted} value={password} onChangeText={setPassword} accessibilityLabel="Senha do PDF" />
            <Button title="Abrir" onPress={() => { const p = passwordFor!; setPasswordFor(null); void parse(p, password); }} disabled={!password} />
            <Pressable onPress={() => setPasswordFor(null)} accessibilityRole="button"><Body muted style={{ textAlign: "center" }}>Cancelar</Body></Pressable>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
