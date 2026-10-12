import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { detectRecurring, formatMonthLong, formatMonthShort, futureInstallmentTimeline, projectCashflow, tryParseBRL, type CashflowMonth } from "@financas/core";
import { formatBRL, formatNumberBR } from "@/lib/format";
import { Banner, Body, Button, Card, ErrorText, H1, Loading, Money, Screen, SectionTitle, Small } from "@/components/ui";
import { monthsOf, useAnalysis } from "@/lib/analysis";
import { useLoad } from "@/lib/data";
import { fetchSettings, saveSettings } from "@/lib/phase3";
import { useReady } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

export default function Fluxo() {
  const t = useTheme();
  const { householdId } = useReady();
  const analysis = useAnalysis();
  const settings = useLoad(fetchSettings);
  const [income, setIncome] = useState<string | null>(null);
  const [fixed, setFixed] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const incomeCents = income !== null ? tryParseBRL(income) ?? 0 : settings.data?.monthlyIncomeCents ?? 0;
  const fixedCents = fixed !== null ? tryParseBRL(fixed) ?? 0 : settings.data?.otherFixedCents ?? 0;

  const projection = useMemo(() => {
    const data = analysis.data;
    if (!data) return null;
    const months = monthsOf(data.txs);
    const latest = months[months.length - 1];
    if (!latest) return null;
    const statement = data.statements.find((s) => s.status === "confirmed" && s.due_date.startsWith(latest));
    const recurring = detectRecurring(data.txs, latest);
    const timeline = futureInstallmentTimeline(data.txs.filter((x) => x.statementMonth === latest && x.kind === "parcela"), latest);
    return { latest, statement, cf: projectCashflow({ latestMonth: latest, txs: data.txs, recurring, futureInstallments: timeline.months, incomeCents, otherFixedCents: fixedCents }) };
  }, [analysis.data, incomeCents, fixedCents]);

  if ((analysis.loading && !analysis.data) || (settings.loading && !settings.data)) return <Screen><Loading /></Screen>;

  async function save() {
    try {
      await saveSettings(householdId, { monthlyIncomeCents: incomeCents, otherFixedCents: fixedCents });
      setMsg("Salvo.");
      void settings.reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 12, fontSize: 16, color: t.text, backgroundColor: t.surface } as const;
  const worst = projection?.cf.months.reduce<CashflowMonth | null>((w, m) => (w === null || m.netCents < w.netCents ? m : w), null) ?? null;
  const maxAbs = Math.max(...(projection?.cf.months.map((m) => Math.abs(m.netCents)) ?? [1]), 1);

  return (
    <Screen onRefresh={() => { void analysis.reload(); void settings.reload(); }} refreshing={analysis.loading}>
      <H1>Fluxo de caixa</H1>
      <Body muted>Quanto sobra (ou falta) nos próximos 6 meses: renda − fixos − parcelas já contratadas − média do gasto variável.</Body>
      {analysis.error ? <ErrorText message={analysis.error} /> : null}

      <Card>
        <SectionTitle>Sua base</SectionTitle>
        <Small>Renda mensal do casal (líquida)</Small>
        <TextInput style={input} keyboardType="numbers-and-punctuation" placeholder="Ex.: 15.000,00" placeholderTextColor={t.textMuted} value={income ?? (settings.data?.monthlyIncomeCents ? formatNumberBR(settings.data.monthlyIncomeCents) : "")} onChangeText={setIncome} accessibilityLabel="Renda mensal" />
        <Small>Outros fixos fora do cartão (aluguel, condomínio, escola…)</Small>
        <TextInput style={input} keyboardType="numbers-and-punctuation" placeholder="Ex.: 4.000,00" placeholderTextColor={t.textMuted} value={fixed ?? (settings.data?.otherFixedCents ? formatNumberBR(settings.data.otherFixedCents) : "")} onChangeText={setFixed} accessibilityLabel="Outros fixos" />
        <Button title="Salvar" small variant="secondary" onPress={save} />
        {msg ? <Small>{msg}</Small> : null}
      </Card>

      {!projection ? (
        <Body muted>Confirme uma fatura para projetar os próximos meses.</Body>
      ) : (
        <>
          {incomeCents === 0 ? (
            <Banner tone="warn" title="Informe a renda para ver o saldo"><Small>Sem renda, todo mês aparece negativo.</Small></Banner>
          ) : worst && worst.netCents < 0 ? (
            <Banner tone="bad" title={`Mês mais apertado: ${formatMonthLong(worst.monthKey)}`}><Small>Faltam {formatBRL(-worst.netCents)}. Reveja fixos, parcelas ou o variável.</Small></Banner>
          ) : (
            <Banner tone="good" title="Saldo positivo nos 6 meses"><Small>Média de sobra: {formatBRL(projection.cf.avgNetCents)} por mês.</Small></Banner>
          )}

          <Card>
            <SectionTitle>Próxima fatura e adiante</SectionTitle>
            <Small>Fixos {formatBRL(projection.cf.fixedCents)} · gasto variável médio {formatBRL(projection.cf.variableAvgCents)} (últimos 3 meses, sem parcelas e recorrências)</Small>
            {projection.cf.months.map((m) => (
              <Pressable key={m.monthKey} accessibilityRole="button" onPress={() => setOpen(open === m.monthKey ? null : m.monthKey)} style={{ gap: 4, paddingVertical: space.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Body style={{ fontWeight: "600" }}>{formatMonthShort(m.monthKey)}</Body>
                  <Body style={{ color: m.netCents < 0 ? t.danger : t.success, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                    {m.netCents < 0 ? "−" : "+"} {formatBRL(Math.abs(m.netCents))}
                  </Body>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: t.border, overflow: "hidden" }}>
                  <View style={{ height: 8, width: `${Math.max((Math.abs(m.netCents) / maxAbs) * 100, 2)}%`, backgroundColor: m.netCents < 0 ? t.danger : t.success }} />
                </View>
                {open === m.monthKey ? (
                  <View style={{ gap: 2, paddingTop: 4 }}>
                    <Line label="Renda" cents={m.incomeCents} />
                    <Line label="Fixos (recorrências + outros)" cents={-m.fixedCents} />
                    <Line label="Parcelas já contratadas" cents={-m.installmentsCents} />
                    <Line label="Gasto variável (média)" cents={-m.variableCents} />
                    <Line label="Acumulado" cents={m.cumulativeNetCents} bold />
                  </View>
                ) : null}
              </Pressable>
            ))}
            <Small>Toque num mês para ver a conta. É uma projeção a partir do seu histórico; compras novas grandes não estão incluídas.</Small>
          </Card>
        </>
      )}
    </Screen>
  );
}

function Line({ label, cents, bold }: { label: string; cents: number; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Small>{label}</Small>
      <Money cents={cents} signed={cents > 0} bold={bold} style={{ fontSize: 14 }} />
    </View>
  );
}
