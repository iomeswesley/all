import { useState } from "react";
import { Pressable, View } from "react-native";
import { formatMonthLong, formatMonthShort, futureInstallmentTimeline, statementMonthKey } from "@financas/core";
import { HBars } from "@/components/charts";
import { Badge, Banner, Body, Card, Empty, ErrorText, H1, Loading, Money, Screen, SectionTitle, Small } from "@/components/ui";
import { fetchConfirmedTransactions, fetchStatements, useLoad } from "@/lib/data";
import { space, useTheme } from "@/lib/theme";
import { formatBRL } from "@/lib/format";

export default function Parcelas() {
  const t = useTheme();
  const { data, error, loading, reload } = useLoad(async () => {
    const [statements, txs] = await Promise.all([fetchStatements(), fetchConfirmedTransactions()]);
    return { statement: statements.find((s) => s.status === "confirmed") ?? null, txs };
  });
  const [open, setOpen] = useState<string | null>(null);

  if (loading && !data) return <Screen><Loading /></Screen>;
  const statement = data?.statement ?? null;
  const month = statement ? statementMonthKey(statement.due_date) : null;
  const parcelas = statement && data ? data.txs.filter((x) => x.statementMonth === month && x.kind === "parcela") : [];
  const timeline = month ? futureInstallmentTimeline(parcelas, month) : null;
  const declared = statement?.declared_future_cents ?? null;
  const diff = timeline && declared !== null ? timeline.totalCommittedCents - Number(declared) : null;

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <H1>Parcelas</H1>
      {error ? <ErrorText message={error} /> : null}
      {!statement || !timeline ? (
        <Empty title="Sem fatura confirmada" hint="Confirme uma fatura para ver o que já está comprometido nos próximos meses." />
      ) : (
        <>
          <Card>
            <Small>Total comprometido em parcelas futuras</Small>
            <Money cents={timeline.totalCommittedCents} bold style={{ fontSize: 32 }} />
            <Small>Com base na fatura de {formatMonthLong(month!)}</Small>
            {diff === 0 ? (
              <Banner tone="good" title="Bate com o saldo de obrigações futuras do banco" />
            ) : diff !== null && Math.abs(diff) <= 5 * timeline.months.reduce((a, m) => a + m.items.length, 0) ? (
              <Banner tone="warn" title={`Bate (≈ ${formatBRL(Math.abs(diff))} de arredondamento)`}>
                <Small>Banco: {formatBRL(Number(declared))}. O banco ajusta centavos nas últimas parcelas.</Small>
              </Banner>
            ) : diff !== null ? (
              <Banner tone="bad" title={`Diferente do banco em ${formatBRL(Math.abs(diff))}`}>
                <Small>Banco: {formatBRL(Number(declared))}. Confira os lançamentos parcelados da fatura.</Small>
              </Banner>
            ) : null}
          </Card>

          <Card>
            <SectionTitle>Piso das próximas faturas</SectionTitle>
            <Small>O mínimo que já vai vir em cada fatura, só de parcelas (sem compras novas).</Small>
            {timeline.months.length === 0 ? <Body muted>Nenhuma parcela futura. 🎉</Body> : <HBars items={timeline.months.map((m) => ({ key: m.monthKey, label: formatMonthShort(m.monthKey), cents: m.totalCents, note: `${m.items.length} parcela${m.items.length > 1 ? "s" : ""}` }))} />}
          </Card>

          {timeline.months.map((m) => (
            <Card key={m.monthKey} style={{ gap: 0 }}>
              <Pressable accessibilityRole="button" onPress={() => setOpen(open === m.monthKey ? null : m.monthKey)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 }}>
                <SectionTitle>{formatMonthLong(m.monthKey)}</SectionTitle>
                <Money cents={m.totalCents} bold />
              </Pressable>
              {open === m.monthKey
                ? m.items.map((i, k) => (
                    <View key={k} style={{ flexDirection: "row", gap: space.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
                      <Body numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{i.description}</Body>
                      <Badge label={`${i.n}/${i.total}`} />
                      <Money cents={i.amountCents} />
                    </View>
                  ))
                : null}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
