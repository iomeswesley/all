import { useState } from "react";
import { TextInput, View } from "react-native";
import { ALLOWANCE_MAX_CENTS, formatNumberBR, tryParseBRL } from "@financas/core";
import { Body, Button, Card, ErrorText, H1, Loading, Screen, SectionTitle, Small } from "@/components/ui";
import { fetchAllowance, saveAllowance } from "@/lib/allowance";
import { useLoad } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { useReady } from "@/lib/session";
import { localToday } from "@/lib/today";
import { radius, space, useTheme } from "@/lib/theme";

/** Mais → Dinheiro livre: o casal combina a mesada mensal de cada um. */
export default function Mesada() {
  const t = useTheme();
  const { householdId } = useReady();
  const month = localToday().slice(0, 7);
  const { data, error, loading, reload } = useLoad(() => fetchAllowance(month), [month]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const input = { flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 12, fontSize: 17, color: t.text, backgroundColor: t.surface } as const;

  async function save(userId: string, raw: string) {
    setFail(null);
    setSaved(null);
    const trimmed = raw.trim();
    const cents = trimmed === "" ? null : tryParseBRL(trimmed);
    if (trimmed !== "" && (cents === null || cents < 0 || cents > ALLOWANCE_MAX_CENTS)) return setFail("Valor inválido. Ex.: 500 ou 500,00.");
    setBusy(userId);
    try {
      await saveAllowance(householdId, userId, cents);
      setDrafts((d) => { const { [userId]: _, ...rest } = d; return rest; });
      setSaved(userId);
      await reload();
    } catch (e) {
      setFail((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <H1>Dinheiro livre</H1>
      <Body muted>Um valor por mês para cada um gastar sem dar satisfação. Conta todo gasto marcado como pessoal 🔒 (fatura pelo mês do vencimento; Pix e dinheiro pelo mês do pagamento).</Body>

      {error ? <ErrorText message={error} /> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <Card>
          <SectionTitle>Valor por mês</SectionTitle>
          <Small>Os valores são combinados pelo casal: qualquer um dos dois pode ajustar, e fica registrado quem mudou. Deixe vazio para não ter mesada.</Small>
          {data.map((m) => {
            const value = drafts[m.userId] ?? (m.monthlyCents !== null ? formatNumberBR(m.monthlyCents) : "");
            const dirty = drafts[m.userId] !== undefined;
            return (
              <View key={m.userId} style={{ gap: space.xs }}>
                <Body style={{ fontWeight: "600" }}>{m.isMe ? `${m.displayName} (você)` : m.displayName}</Body>
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                  <TextInput
                    style={input}
                    value={value}
                    onChangeText={(v) => setDrafts((d) => ({ ...d, [m.userId]: v }))}
                    placeholder="R$ 0,00"
                    placeholderTextColor={t.textMuted}
                    keyboardType="numbers-and-punctuation"
                    accessibilityLabel={`Dinheiro livre de ${m.displayName} por mês`}
                  />
                  <Button title="Salvar" small disabled={!dirty} loading={busy === m.userId} onPress={() => void save(m.userId, value)} />
                </View>
                {saved === m.userId ? <Small style={{ color: t.success }}>Salvo.</Small> : null}
                {!m.isMe && m.monthlyCents !== null ? <Small>{`Você vê só a porcentagem que ${m.displayName} usou, nunca os itens.`}</Small> : null}
                {m.isMe && m.monthlyCents !== null ? <Small>{`Este mês: ${formatBRL(m.usedCents)} de ${formatBRL(m.monthlyCents)}.`}</Small> : null}
              </View>
            );
          })}
          {fail ? <ErrorText message={fail} /> : null}
        </Card>
      ) : null}


      <Card>
        <SectionTitle>Privacidade</SectionTitle>
        <Small>Os itens do gasto pessoal continuam só seus. Seu par enxerga apenas “usou 62%” da sua mesada — nunca o que foi comprado, onde ou quando.</Small>
      </Card>
    </Screen>
  );
}
