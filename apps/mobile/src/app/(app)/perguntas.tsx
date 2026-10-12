import { useMemo, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { effectiveDate, formatBrDate, formatMonthShort, runQuery, type QueryResult } from "@financas/core";
import { formatBRL } from "@/lib/format";
import { HBars } from "@/components/charts";
import { Banner, Body, Button, Card, Chip, ErrorText, H1, Loading, Row, Screen, SectionTitle, Small } from "@/components/ui";
import { useAnalysis } from "@/lib/analysis";
import { useLoad } from "@/lib/data";
import { deleteQuery, fetchSavedQueries, saveQuery } from "@/lib/phase3";
import { useReady } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

const EXAMPLES = [
  "quanto gastamos com restaurante desde julho?",
  "onde mais gastamos no mês passado?",
  "quantas vezes fomos em padaria em agosto?",
  "média de gastos com mercado nos últimos 3 meses",
  "quanto paguei de IOF este ano?",
];

/** Perguntas em português respondidas por regras locais, só com os dados do casal (nada vai para IA). */
export default function Perguntas() {
  const t = useTheme();
  const { householdId, me, partner, user } = useReady();
  const analysis = useAnalysis();
  const saved = useLoad(fetchSavedQueries);
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);

  const result = useMemo<QueryResult | null>(() => {
    if (!asked || !analysis.data) return null;
    return runQuery(asked, analysis.data.txs, { today: new Date().toISOString().slice(0, 10), meUserId: me.user_id, partnerUserId: partner?.user_id ?? null, partnerName: partner?.display_name ?? null });
  }, [asked, analysis.data, me.user_id, partner]);

  const ask = (q: string) => { setText(q); setAsked(q.trim()); };
  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 14, fontSize: 16, color: t.text, backgroundColor: t.surface } as const;

  if (analysis.loading && !analysis.data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={() => { void analysis.reload(); void saved.reload(); }} refreshing={analysis.loading}>
      <H1>Pergunte aos dados</H1>
      <Body muted>Escreva como falaria. Respondo só com os lançamentos do casal, calculados aqui no app — nenhuma IA vê seus dados.</Body>
      <TextInput style={input} placeholder="Ex.: quanto gastamos com restaurante desde julho?" placeholderTextColor={t.textMuted} value={text} onChangeText={setText} onSubmitEditing={() => ask(text)} returnKeyType="search" multiline accessibilityLabel="Pergunta" />
      <Button title="Perguntar" onPress={() => ask(text)} disabled={text.trim().length < 3} />

      {!result ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {EXAMPLES.map((e) => <Chip key={e} label={e} onPress={() => ask(e)} />)}
        </View>
      ) : (
        <>
          <Banner tone={result.ok && result.count > 0 ? "good" : "warn"} title={result.ok ? "Resposta" : "Não entendi"}>
            <Body>{result.answer}</Body>
          </Banner>
          {result.notes.map((n) => <Small key={n}>ℹ️ {n}</Small>)}
          {result.ok && result.count > 0 ? (
            <>
              <Card>
                <SectionTitle>Mês a mês</SectionTitle>
                <HBars items={result.byMonth.map((m) => ({ key: m.month, label: formatMonthShort(m.month), cents: m.cents }))} />
                <Small>Parcelas contam no mês em que foram cobradas; as demais compras, na data da compra.</Small>
              </Card>
              <Card>
                <SectionTitle>Principais</SectionTitle>
                <HBars items={result.topMerchants.map((m) => ({ key: m.label, label: m.label, cents: m.cents, note: m.count > 1 ? `${m.count} compras` : undefined }))} />
              </Card>
              <Card style={{ gap: 0 }}>
                <SectionTitle>Lançamentos ({Math.min(result.rows.length, 50)}{result.count > 50 ? ` de ${result.count}` : ""})</SectionTitle>
                {result.rows.slice(0, 20).map((r, i) => (
                  <Row key={i} last={i === Math.min(result.rows.length, 20) - 1}>
                    <View style={{ flex: 1 }}>
                      <Body numberOfLines={1}>{r.merchantName ?? r.descriptionRaw}</Body>
                      <Small>{formatBrDate(effectiveDate(r))}</Small>
                    </View>
                    <Body>{formatBRL(r.amountCents)}</Body>
                  </Row>
                ))}
              </Card>
            </>
          ) : null}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Salvar esta pergunta"
                variant="secondary"
                disabled={!result.ok}
                onPress={() => void saveQuery(householdId, user.id, asked!.slice(0, 40), asked!).then(() => saved.reload()).catch((e: Error) => setFail(e.message))}
              />
            </View>
            <Button title="Limpar" variant="ghost" onPress={() => { setAsked(null); setText(""); }} />
          </View>
        </>
      )}
      {fail ? <ErrorText message={fail} /> : null}

      {(saved.data ?? []).length > 0 ? (
        <Card style={{ gap: 0 }}>
          <SectionTitle>Perguntas salvas</SectionTitle>
          {(saved.data ?? []).map((s, i, arr) => (
            <Row key={s.id} last={i === arr.length - 1} onPress={() => ask(s.question)}>
              <Body style={{ flex: 1 }} numberOfLines={2}>{s.question}</Body>
              <Pressable accessibilityRole="button" accessibilityLabel="Excluir pergunta salva" hitSlop={10} onPress={() => Alert.alert("Excluir pergunta salva?", s.question, [{ text: "Cancelar", style: "cancel" }, { text: "Excluir", style: "destructive", onPress: () => void deleteQuery(s.id).then(() => saved.reload()) }])}>
                <Small>🗑</Small>
              </Pressable>
            </Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
