import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { formatBrDayMonth, pastOpenOccurrences, suggestPlannedMatches, type PlannedExpense, type PlannedMark, type PlannedOccurrence } from "@financas/core";
import { Badge, Body, Button, Card, ErrorText, IconButton, Row, SectionTitle, Small } from "@/components/ui";
import type { TxRow } from "@/lib/data";
import { useLoad } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { fetchPlannedMarks, savePlannedMark, toMatchTx } from "@/lib/planned-matches";
import { useReady } from "@/lib/session";
import { useTheme } from "@/lib/theme";

const MAX_SUGGESTIONS = 4;
const MAX_MANUAL = 3;

/** "Já aconteceu?": sugere dar baixa no planejado que apareceu no realizado (✓ / ✕) e deixa marcar à mão. */
export function PlannedMatchCard({ planned, txs, today }: { planned: readonly PlannedExpense[]; txs: readonly TxRow[]; today: string }) {
  const t = useTheme();
  const { householdId } = useReady();
  const marks = useLoad(fetchPlannedMarks);
  const [local, setLocal] = useState<PlannedMark[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const view = useMemo(() => {
    if (!marks.data) return null;
    const all = [...marks.data, ...local];
    const suggestions = suggestPlannedMatches({ planned, txs: txs.map(toMatchTx), marks: all, today }).slice(0, MAX_SUGGESTIONS);
    const suggested = new Set(suggestions.map((s) => `${s.occurrence.id}|${s.occurrence.date}`));
    const manual = pastOpenOccurrences(planned, all, today).filter((o) => !suggested.has(`${o.id}|${o.date}`)).slice(0, MAX_MANUAL);
    return { suggestions, manual };
  }, [marks.data, local, planned, txs, today]);

  if (!view || (view.suggestions.length === 0 && view.manual.length === 0)) return null;

  const save = async (key: string, m: PlannedMark) => {
    setBusy(key);
    setError(null);
    try {
      await savePlannedMark(householdId, m);
      setLocal((l) => [...l, m]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const keyOf = (o: PlannedOccurrence) => `${o.id}|${o.date}`;
  const rows = view.suggestions.length + view.manual.length;

  return (
    <Card style={{ paddingVertical: 4, gap: 0 }}>
      <View style={{ paddingTop: 12 }}><SectionTitle>Já aconteceu?</SectionTitle></View>
      {view.suggestions.map((s, si) => {
        const k = keyOf(s.occurrence);
        const last = si === rows - 1;
        const disabled = busy === k;
        return (
          <Row key={k} last={last}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Body numberOfLines={1} style={{ fontWeight: "600", flexShrink: 1 }}>{s.occurrence.description}</Body>
                {s.confidence !== "alta" ? <Badge label="confira" tone="warn" /> : null}
              </View>
              <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.textMuted }}>
                {formatBrDayMonth(s.tx.postedOn)} · {s.tx.merchantName ?? s.tx.descriptionRaw}
              </Text>
            </View>
            <Text style={{ color: t.text, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{formatBRL(s.tx.amountCents)}</Text>
            <IconButton icon="close" label={`Não é ${s.occurrence.description}`} onPress={() => { if (!disabled) void save(k, { plannedId: s.occurrence.id, occurrenceDate: s.occurrence.date, transactionId: s.tx.id, status: "ignorado" }); }} />
            <IconButton icon="checkmark" filled label={`Confirmar ${s.occurrence.description}`} onPress={() => { if (!disabled) void save(k, { plannedId: s.occurrence.id, occurrenceDate: s.occurrence.date, transactionId: s.tx.id, status: "feito" }); }} />
          </Row>
        );
      })}
      {view.manual.map((o, mi) => {
        const k = keyOf(o);
        const last = view.suggestions.length + mi === rows - 1;
        return (
          <Row key={k} last={last}>
            <View style={{ flex: 1 }}>
              <Body numberOfLines={1} style={{ fontWeight: "600" }}>{o.description}</Body>
              <Small>{formatBrDayMonth(o.date)}{o.label ? ` · ${o.label}` : ""} · {formatBRL(o.amountCents)}</Small>
            </View>
            <Button title="Feito" small variant="ghost" loading={busy === k} onPress={() => void save(k, { plannedId: o.id, occurrenceDate: o.date, transactionId: null, status: "feito" })} />
          </Row>
        );
      })}
      {error || marks.error ? <View style={{ paddingBottom: 12 }}><ErrorText message={(error ?? marks.error)!} /></View> : null}
    </Card>
  );
}
