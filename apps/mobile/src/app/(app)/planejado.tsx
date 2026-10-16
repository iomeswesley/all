import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { addMonthsToKey, CATEGORIES, formatBrDate, formatNumberBR, parsePlannedDate, REPEAT_LABEL, tryParseBRL, validatePlanned, type PlannedExpense, type PlannedRepeat } from "@financas/core";
import { Button, Card, Chip, Empty, ErrorText, Loading, Screen, Segmented, Small } from "@/components/ui";
import { useLoad } from "@/lib/data";
import { deletePlanned, fetchPlanned, savePlanned } from "@/lib/planned";
import { useReady } from "@/lib/session";
import { categoryColor, radius, space, useTheme } from "@/lib/theme";
import { localToday } from "@/lib/today";

const REPEATS: PlannedRepeat[] = ["once", "monthly", "yearly"];

/** Adicionar ou editar um gasto futuro (uma vez, todo mês ou todo ano). */
export default function Planejado() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useLoad(fetchPlanned, [id]);
  if (!id) return <Form />;
  if (!existing.data) return <Screen>{existing.error ? <ErrorText message={existing.error} /> : <Loading />}</Screen>;
  const p = existing.data.find((x) => x.id === id);
  return p ? <Form initial={p} /> : <Screen><Empty title="Este gasto futuro não existe mais." /></Screen>;
}

function Form({ initial }: { initial?: PlannedExpense }) {
  const t = useTheme();
  const router = useRouter();
  const id = initial?.id;
  const { householdId } = useReady();
  const [amount, setAmount] = useState(initial ? formatNumberBR(initial.amountCents) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dateText, setDateText] = useState(initial ? formatBrDate(initial.firstDate) : "");
  const [repeat, setRepeat] = useState<PlannedRepeat>(initial?.repeat ?? "once");
  const [times, setTimes] = useState(initial?.occurrences ? String(initial.occurrences) : "");
  const [category, setCategory] = useState<number | null>(initial?.categoryId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = localToday();

  const date = parsePlannedDate(dateText, today);
  const nextMonths = [1, 2, 3].map((n) => addMonthsToKey(today.slice(0, 7), n));
  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 14, fontSize: 17, color: t.text, backgroundColor: t.surfaceAlt } as const;

  async function submit() {
    setError(null);
    if (!date) return setError("Data inválida. Use dd/mm ou dd/mm/aaaa.");
    const occurrences = repeat === "once" || times.trim() === "" ? null : Number(times);
    const entry = { description, amountCents: tryParseBRL(amount) ?? 0, firstDate: date, repeat, occurrences, categoryId: category };
    const problem = validatePlanned(entry);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await savePlanned(householdId, entry, id);
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!id) return;
    Alert.alert("Excluir este gasto futuro?", repeat === "once" ? undefined : "Todas as repetições saem da previsão.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => void deletePlanned(id).then(() => router.back(), (e: Error) => setError(e.message)) },
    ]);
  }

  return (
    <Screen>
      <Card>
        <TextInput style={[input, { fontSize: 32, fontWeight: "800", backgroundColor: "transparent", borderWidth: 0, paddingHorizontal: 0 }]} placeholder="R$ 0,00" placeholderTextColor={t.textMuted} keyboardType="numbers-and-punctuation" value={amount} onChangeText={setAmount} autoFocus={!id} accessibilityLabel="Valor em reais" />
        <TextInput style={input} placeholder="O que é? (ex.: IPVA, viagem)" placeholderTextColor={t.textMuted} value={description} onChangeText={setDescription} maxLength={80} accessibilityLabel="Descrição" />
      </Card>

      <Card>
        <Small>Quando</Small>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {nextMonths.map((m) => {
            const iso = `${m}-10`;
            return <Chip key={m} label={`10/${m.slice(5)}`} selected={date === iso} onPress={() => setDateText(formatBrDate(iso))} />;
          })}
        </View>
        <TextInput style={input} placeholder="dd/mm ou dd/mm/aaaa" placeholderTextColor={t.textMuted} value={dateText} onChangeText={setDateText} keyboardType="numbers-and-punctuation" accessibilityLabel="Data" />
        {dateText && date ? <Small>{formatBrDate(date)}</Small> : null}
        <Segmented options={REPEATS.map((r) => ({ value: r, label: REPEAT_LABEL[r] }))} value={repeat} onChange={setRepeat} />
        {repeat !== "once" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <TextInput style={[input, { width: 96, textAlign: "center" }]} placeholder="∞" placeholderTextColor={t.textMuted} value={times} onChangeText={(s) => setTimes(s.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={3} accessibilityLabel="Quantas vezes" />
            <Text style={{ color: t.textSecondary, flex: 1 }}>{times ? "vezes" : "sem data para acabar"}</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <Small>Categoria (opcional)</Small>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {CATEGORIES.map((c) => <Chip key={c.id} label={c.name} color={categoryColor(t, c.id)} selected={category === c.id} onPress={() => setCategory(category === c.id ? null : c.id)} />)}
        </View>
      </Card>

      {error ? <ErrorText message={error} /> : null}
      <Button title={id ? "Salvar" : "Adicionar à previsão"} onPress={submit} loading={busy} />
      {id ? <Button title="Excluir" variant="ghost" onPress={remove} /> : null}
    </Screen>
  );
}
