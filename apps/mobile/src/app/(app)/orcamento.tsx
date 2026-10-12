import { useMemo, useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import { CATEGORIES, budgetStatuses, formatBRL, formatMonthLong, formatNumberBR, tryParseBRL, type BudgetStatus } from "@financas/core";
import { Badge, Body, Button, Card, ErrorText, H1, Loading, Money, Screen, SectionTitle, Small } from "@/components/ui";
import { budgetsFor, monthsOf, useAnalysis } from "@/lib/analysis";
import { saveBudget } from "@/lib/mutations";
import { useReady } from "@/lib/session";
import { categoryColor, radius, space, useTheme } from "@/lib/theme";

const LEVEL = {
  ok: { label: "No caminho", tone: "good" as const },
  warn80: { label: "Perto do limite", tone: "warn" as const },
  over100: { label: "Estourou", tone: "bad" as const },
};

export default function Orcamento() {
  const t = useTheme();
  const { householdId } = useReady();
  const { data, error, loading, reload } = useAnalysis();
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [fail, setFail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const view = useMemo(() => {
    if (!data) return null;
    const months = monthsOf(data.txs);
    const month = picked && months.includes(picked) ? picked : months[months.length - 1];
    if (!month) return null;
    const limits = budgetsFor(data.budgetRows, month);
    const statuses = new Map<number, BudgetStatus>(budgetStatuses(limits, data.txs.filter((x) => x.statementMonth === month)).map((s) => [s.categoryId, s]));
    // gasto por categoria mesmo sem limite
    const spent = new Map<number, number>();
    for (const x of data.txs) if (x.statementMonth === month && x.kind !== "pagamento") spent.set(x.categoryId ?? 12, (spent.get(x.categoryId ?? 12) ?? 0) + x.amountCents);
    return { months, month, limits, statuses, spent };
  }, [data, picked]);

  if (loading && !data) return <Screen><Loading /></Screen>;

  async function save(categoryId: number, cents: number) {
    if (!view) return;
    setBusy(true);
    setFail(null);
    try {
      await saveBudget(householdId, categoryId, view.month, cents);
      setEditing(null);
      await reload();
    } catch (e) {
      setFail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 14, fontSize: 18, color: t.text, backgroundColor: t.surface } as const;
  const idx = view ? view.months.indexOf(view.month) : 0;
  const editingCat = CATEGORIES.find((c) => c.id === editing);

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <H1>Orçamento</H1>
      {error ? <ErrorText message={error} /> : null}
      {!view ? (
        <Body muted>Confirme uma fatura para começar a acompanhar o orçamento por categoria.</Body>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Button title="‹" variant="ghost" small disabled={idx === 0} onPress={() => setPicked(view.months[idx - 1]!)} />
              <View style={{ alignItems: "center" }}>
                <Small>Fatura de</Small>
                <Body style={{ fontWeight: "700" }}>{formatMonthLong(view.month)}</Body>
              </View>
              <Button title="›" variant="ghost" small disabled={idx === view.months.length - 1} onPress={() => setPicked(view.months[idx + 1]!)} />
            </View>
            <Small>O limite vale para esta fatura e as seguintes, até você mudar. Avisamos em 80% e em 100% quando uma fatura é confirmada.</Small>
          </Card>

          {CATEGORIES.map((c) => {
            const limit = view.limits.get(c.id) ?? 0;
            const st = view.statuses.get(c.id);
            const spentCents = view.spent.get(c.id) ?? 0;
            const pct = st ? st.percent : 0;
            const color = !st ? t.border : st.level === "over100" ? t.danger : st.level === "warn80" ? t.warning : t.primary;
            return (
              <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${c.name}. ${limit ? `Limite ${formatBRL(limit)}, gasto ${formatBRL(spentCents)}` : `Sem limite, gasto ${formatBRL(spentCents)}`}. Editar limite`} onPress={() => { setEditing(c.id); setValue(limit ? formatNumberBR(limit) : ""); setFail(null); }}>
                <Card style={{ gap: space.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: categoryColor(t, c.id) }} />
                    <Body style={{ flex: 1, fontWeight: "600" }} numberOfLines={1}>{c.name}</Body>
                    {st ? <Badge label={`${LEVEL[st.level].label} · ${st.percent}%`} tone={LEVEL[st.level].tone} /> : <Small>sem limite</Small>}
                  </View>
                  {limit > 0 ? (
                    <>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.border, overflow: "hidden" }}>
                        <View style={{ height: 8, width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Money cents={spentCents} />
                        <Small>de {formatBRL(limit)}{st && st.remainingCents < 0 ? ` · estourou ${formatBRL(-st.remainingCents)}` : ""}</Small>
                      </View>
                    </>
                  ) : (
                    <Small>Gasto no mês: {formatBRL(spentCents)} · toque para definir um limite</Small>
                  )}
                </Card>
              </Pressable>
            );
          })}
        </>
      )}

      <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: t.surface, padding: space.lg, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
            <SectionTitle>{editingCat?.name}</SectionTitle>
            <Small>Limite mensal em reais. Vale a partir de {view ? formatMonthLong(view.month) : ""}. Deixe vazio para remover.</Small>
            <TextInput style={input} placeholder="Ex.: 1.500,00" placeholderTextColor={t.textMuted} keyboardType="numbers-and-punctuation" value={value} onChangeText={setValue} accessibilityLabel="Limite em reais" autoFocus />
            {fail ? <ErrorText message={fail} /> : null}
            <Button
              title="Salvar limite"
              loading={busy}
              onPress={() => {
                const cents = value.trim() === "" ? 0 : tryParseBRL(value);
                if (cents === null || cents < 0) return setFail("Valor inválido. Use o formato 1.500,00.");
                void save(editing!, cents);
              }}
            />
            <Button title="Cancelar" variant="ghost" onPress={() => setEditing(null)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
