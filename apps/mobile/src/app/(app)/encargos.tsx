import { useMemo } from "react";
import { View } from "react-native";
import { avoidableCharges, formatBRL, formatMonthLong, statementMonthKey } from "@financas/core";
import { Badge, Body, Card, Empty, ErrorText, H1, Loading, Money, Screen, SectionTitle, Small } from "@/components/ui";
import { monthsOf, useAnalysis } from "@/lib/analysis";
import { space, useTheme } from "@/lib/theme";

const LABELS: Record<string, string> = { anuidade: "Anuidade", iof: "IOF", juros: "Juros", multa: "Multa", mora: "Mora", seguro: "Seguros", tarifa: "Tarifas" };

export default function Encargos() {
  const t = useTheme();
  const { data, error, loading, reload } = useAnalysis();
  const rows = useMemo(() => {
    if (!data) return [];
    return monthsOf(data.txs).reverse().map((month) => {
      const st = data.statements.find((s) => s.status === "confirmed" && statementMonthKey(s.due_date) === month);
      const c = avoidableCharges(data.txs.filter((x) => x.statementMonth === month && !x.hiddenAggregate), st ? { installmentCents: st.annuity_cents, paidCents: st.annuity_paid_cents, discountPercent: st.annuity_discount_percent } : null);
      return { month, c };
    });
  }, [data]);

  if (loading && !data) return <Screen><Loading /></Screen>;
  const total = rows.reduce((a, r) => a + r.c.totalCents, 0);
  const late = rows.reduce((a, r) => a + r.c.lateCents, 0);
  const iof = rows.reduce((a, r) => a + r.c.iofCents, 0);
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <H1>Encargos</H1>
      {error ? <ErrorText message={error} /> : null}
      {rows.length === 0 ? <Empty title="Sem faturas confirmadas" /> : (
        <>
          <Card>
            <Small>Total pago em encargos nas {rows.length} faturas</Small>
            <Money cents={total} bold style={{ fontSize: 28 }} />
            <Body muted>IOF {formatBRL(iof)} · juros/multa/mora {formatBRL(late)}</Body>
            <Small>Juros, multa e mora são 100% evitáveis pagando o total até o vencimento. IOF de compras em dólar só diminui comprando menos no exterior.</Small>
          </Card>
          {rows.map(({ month, c }) => (
            <Card key={month} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <SectionTitle>{formatMonthLong(month)}</SectionTitle>
                <Money cents={c.totalCents} bold color={c.lateCents > 0 ? t.danger : undefined} />
              </View>
              {Object.entries(c.byType).filter(([, v]) => v > 0).map(([k, v]) => (
                <View key={k} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Body muted>{LABELS[k]}</Body>
                  <Money cents={v} />
                </View>
              ))}
              {c.annuity ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <Badge label={c.annuity.waived ? "Anuidade isenta" : "Anuidade cobrada"} tone={c.annuity.waived ? "good" : "warn"} />
                  <Small>{c.annuity.waived ? `${c.annuity.discountPercent}% de desconto · economia ${formatBRL(c.annuity.savedPerMonthCents)}/mês` : formatBRL(c.annuity.paidCents)}</Small>
                </View>
              ) : null}
              {c.totalCents === 0 && !c.annuity ? <Small>Nenhum encargo.</Small> : null}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
