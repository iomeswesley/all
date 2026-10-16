import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Switch, TextInput, View } from "react-native";
import { CATEGORIES, METHOD_LABEL, parseEntryDate, tryParseBRL, validateManualEntry, type ManualMethod } from "@financas/core";
import { categoryColor, radius, space, useTheme } from "@/lib/theme";
import { Body, Button, Card, Chip, ErrorText, H1, Screen, SectionTitle, Small } from "@/components/ui";
import { addManualEntry } from "@/lib/manual";
import { useReady } from "@/lib/session";
import { refreshWidget } from "@/widget";

const METHODS: ManualMethod[] = ["pix", "dinheiro", "debito", "boleto", "outro"];
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Lançamento rápido de gasto que não passou no cartão: Pix, dinheiro, débito, boleto. */
export default function Lancar() {
  const t = useTheme();
  const router = useRouter();
  const { householdId, me, partner } = useReady();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<ManualMethod>("pix");
  const [category, setCategory] = useState<number | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [dateText, setDateText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 14, fontSize: 17, color: t.text, backgroundColor: t.surface } as const;

  async function submit() {
    setError(null);
    const today = todayIso();
    const date = parseEntryDate(dateText, today);
    if (!date) return setError("Data inválida. Use dd/mm, “hoje” ou “ontem”.");
    const cents = tryParseBRL(amount);
    const entry = { description, amountCents: cents ?? 0, date, method, categoryId: category, ownerUserId: owner, isPrivate: isPrivate && owner !== null };
    const problem = validateManualEntry(entry, today);
    if (problem) return setError(problem);

    setBusy(true);
    try {
      const res = await addManualEntry(householdId, entry);
      refreshWidget();
      const alerts = res.notify?.alerts ?? [];
      const lines = [res.needsReview ? "Ficou sem categoria — ela aparece em Revisar." : "Lançado.", ...alerts.map((a) => `• ${a.title}\n  ${a.body}`)];
      Alert.alert(alerts.length ? "Lançado — atenção ao orçamento" : "Lançado", lines.join("\n\n"), [
        { text: "Lançar outro", onPress: () => { setAmount(""); setDescription(""); setDateText(""); setCategory(null); } },
        { text: "Pronto", onPress: () => router.back() },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Lançar gasto</H1>
      <Body muted>Para o que não passou no cartão: Pix, dinheiro, débito, boleto. Conta no painel e no orçamento do mês em que foi pago.</Body>

      <Card>
        <TextInput style={[input, { fontSize: 28, fontWeight: "700" }]} placeholder="R$ 0,00" placeholderTextColor={t.textMuted} keyboardType="numbers-and-punctuation" value={amount} onChangeText={setAmount} autoFocus accessibilityLabel="Valor em reais" />
        <TextInput style={input} placeholder="O que foi? (ex.: Diarista)" placeholderTextColor={t.textMuted} value={description} onChangeText={setDescription} maxLength={80} accessibilityLabel="Descrição" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {METHODS.map((m) => <Chip key={m} label={METHOD_LABEL[m]} selected={method === m} onPress={() => setMethod(m)} />)}
        </View>
      </Card>

      <Card>
        <SectionTitle>Categoria</SectionTitle>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <Chip label="Sugerir pelas regras" selected={category === null} onPress={() => setCategory(null)} />
          {CATEGORIES.map((c) => <Chip key={c.id} label={c.name} color={categoryColor(t, c.id)} selected={category === c.id} onPress={() => setCategory(c.id)} />)}
        </View>
        <Small>Sem escolher, uso as regras do casal; se não reconhecer, vai para Revisar.</Small>
      </Card>

      <Card>
        <SectionTitle>Quando e de quem</SectionTitle>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Chip label="Hoje" selected={dateText === ""} onPress={() => setDateText("")} />
          <Chip label="Ontem" selected={dateText === "ontem"} onPress={() => setDateText("ontem")} />
        </View>
        <TextInput style={input} placeholder="Outra data (dd/mm)" placeholderTextColor={t.textMuted} value={dateText === "ontem" ? "" : dateText} onChangeText={setDateText} accessibilityLabel="Outra data" />
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Chip label="Nosso" selected={owner === null} onPress={() => { setOwner(null); setIsPrivate(false); }} />
          <Chip label="Meu" selected={owner === me.user_id} onPress={() => setOwner(me.user_id)} />
          {partner ? <Chip label={partner.display_name} selected={owner === partner.user_id} onPress={() => { setOwner(partner.user_id); setIsPrivate(false); }} /> : null}
        </View>
        {owner === me.user_id && partner ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Body>Gasto pessoal 🔒</Body>
              <Small>{partner.display_name} vê só o total da categoria, não este item.</Small>
            </View>
            <Switch value={isPrivate} onValueChange={setIsPrivate} accessibilityLabel="Gasto pessoal" />
          </View>
        ) : null}
      </Card>

      {error ? <ErrorText message={error} /> : null}
      <Button title="Lançar" onPress={submit} loading={busy} />
    </Screen>
  );
}
