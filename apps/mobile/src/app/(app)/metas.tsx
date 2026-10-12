import { useState } from "react";
import { Alert, Modal, TextInput, View } from "react-native";
import { goalFeasibility, goalProgress, parseBrDate, tryParseBRL, formatBrDate, detectRecurring, futureInstallmentTimeline, projectCashflow } from "@financas/core";
import { formatBRL } from "@/lib/format";
import { Badge, Body, Button, Card, Empty, ErrorText, H1, Loading, Money, Screen, SectionTitle, Small } from "@/components/ui";
import { monthsOf, useAnalysis } from "@/lib/analysis";
import { useLoad } from "@/lib/data";
import { createGoal, deleteGoal, fetchGoals, fetchSettings, setGoalSaved } from "@/lib/phase3";
import { useReady } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Metas() {
  const t = useTheme();
  const { householdId } = useReady();
  const goals = useLoad(fetchGoals);
  const settings = useLoad(fetchSettings);
  const analysis = useAnalysis();
  const [adding, setAdding] = useState(false);
  const [depositFor, setDepositFor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [due, setDue] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // quanto sobra por mês (mesma conta do fluxo de caixa), só se a renda foi informada
  const surplus = (() => {
    const d = analysis.data;
    const s = settings.data;
    if (!d || !s || s.monthlyIncomeCents === 0) return null;
    const latest = monthsOf(d.txs).at(-1);
    if (!latest) return null;
    const rec = detectRecurring(d.txs, latest);
    const tl = futureInstallmentTimeline(d.txs.filter((x) => x.statementMonth === latest && x.kind === "parcela"), latest);
    return Math.max(projectCashflow({ latestMonth: latest, txs: d.txs, recurring: rec, futureInstallments: tl.months, incomeCents: s.monthlyIncomeCents, otherFixedCents: s.otherFixedCents }).avgNetCents, 0);
  })();

  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 12, fontSize: 16, color: t.text, backgroundColor: t.surface } as const;
  const wrap = async (fn: () => Promise<void>) => {
    setErr(null);
    try { await fn(); await goals.reload(); } catch (e) { setErr((e as Error).message); }
  };

  if (goals.loading && !goals.data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={() => void goals.reload()} refreshing={goals.loading}>
      <H1>Metas</H1>
      {goals.error || err ? <ErrorText message={(goals.error ?? err)!} /> : null}
      <Button title="Nova meta" onPress={() => { setName(""); setTarget(""); setDue(""); setErr(null); setAdding(true); }} />

      {goals.data && goals.data.length === 0 ? <Empty title="Nenhuma meta ainda" hint="Ex.: viagem, reserva de emergência, entrada do carro." /> : null}
      {(goals.data ?? []).map((g) => {
        const p = goalProgress({ targetCents: g.targetCents, savedCents: g.savedCents, dueDate: g.dueDate }, todayIso());
        const fit = goalFeasibility(p.monthlyNeededCents, surplus);
        const color = p.status === "concluida" ? t.success : p.status === "atrasada" ? t.danger : t.primary;
        return (
          <Card key={g.id} style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md }}>
              <Body style={{ fontWeight: "700", fontSize: 16, flex: 1 }} numberOfLines={2}>{g.name}</Body>
              <Badge label={p.status === "concluida" ? "Concluída" : p.status === "atrasada" ? "Atrasada" : p.status === "sem_prazo" ? "Sem prazo" : `${p.monthsLeft} meses`} tone={p.status === "concluida" ? "good" : p.status === "atrasada" ? "bad" : "neutral"} />
            </View>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: t.border, overflow: "hidden" }}>
              <View style={{ height: 10, width: `${Math.min(p.percent, 100)}%`, backgroundColor: color }} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Money cents={g.savedCents} bold />
              <Small>de {formatBRL(g.targetCents)} · {p.percent}%</Small>
            </View>
            {p.status !== "concluida" ? (
              <Body muted>
                {p.monthlyNeededCents !== null
                  ? `Guardar ${formatBRL(p.monthlyNeededCents)} por mês até ${formatBrDate(g.dueDate!)}.`
                  : `Faltam ${formatBRL(p.remainingCents)}. Defina um prazo para saber quanto guardar por mês.`}
              </Body>
            ) : null}
            {p.monthlyNeededCents && fit !== "desconhecido" ? (
              <Small>{fit === "cabe" ? "✓ Cabe folgado no que sobra por mês." : fit === "apertado" ? "≈ Cabe, mas apertado (usa mais de 70% da sobra)." : `✕ Não cabe: a sobra projetada é ${formatBRL(surplus ?? 0)} por mês.`}</Small>
            ) : surplus === null && p.monthlyNeededCents ? <Small>Informe a renda em Fluxo de caixa para saber se cabe.</Small> : null}
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}><Button title="+ Guardei" small variant="secondary" onPress={() => { setAmount(""); setDepositFor(g.id); }} /></View>
              <Button title="Excluir" small variant="ghost" onPress={() => Alert.alert("Excluir meta?", g.name, [{ text: "Cancelar", style: "cancel" }, { text: "Excluir", style: "destructive", onPress: () => void wrap(() => deleteGoal(g.id)) }])} />
            </View>
          </Card>
        );
      })}

      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: t.surface, padding: space.lg, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
            <SectionTitle>Nova meta</SectionTitle>
            <TextInput style={input} placeholder="Nome (ex.: Viagem)" placeholderTextColor={t.textMuted} value={name} onChangeText={setName} accessibilityLabel="Nome da meta" />
            <TextInput style={input} placeholder="Valor total (ex.: 12.000,00)" placeholderTextColor={t.textMuted} keyboardType="numbers-and-punctuation" value={target} onChangeText={setTarget} accessibilityLabel="Valor total" />
            <TextInput style={input} placeholder="Prazo dd/mm/aaaa (opcional)" placeholderTextColor={t.textMuted} value={due} onChangeText={setDue} accessibilityLabel="Prazo" />
            {err ? <ErrorText message={err} /> : null}
            <Button
              title="Criar meta"
              onPress={() => {
                const cents = tryParseBRL(target);
                if (!name.trim() || cents === null || cents <= 0) return setErr("Informe o nome e um valor maior que zero.");
                let dueIso: string | null = null;
                try { dueIso = due.trim() ? parseBrDate(due) : null; } catch { return setErr("Prazo inválido. Use dd/mm/aaaa."); }
                void wrap(async () => { await createGoal(householdId, { name: name.trim(), targetCents: cents, dueDate: dueIso }); setAdding(false); });
              }}
            />
            <Button title="Cancelar" variant="ghost" onPress={() => setAdding(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={depositFor !== null} transparent animationType="fade" onRequestClose={() => setDepositFor(null)}>
        <View style={{ flex: 1, backgroundColor: "#000a", justifyContent: "center", padding: space.xl }}>
          <Card>
            <SectionTitle>Quanto você guardou?</SectionTitle>
            <TextInput style={input} placeholder="Ex.: 500,00 (negativo para retirar)" placeholderTextColor={t.textMuted} keyboardType="numbers-and-punctuation" value={amount} onChangeText={setAmount} autoFocus accessibilityLabel="Valor guardado" />
            <Button
              title="Somar à meta"
              onPress={() => {
                const cents = tryParseBRL(amount);
                const g = goals.data?.find((x) => x.id === depositFor);
                if (cents === null || !g) return;
                void wrap(async () => { await setGoalSaved(g.id, g.savedCents + cents); setDepositFor(null); });
              }}
            />
            <Button title="Cancelar" variant="ghost" onPress={() => setDepositFor(null)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
