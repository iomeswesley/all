import { useMemo } from "react";
import { View } from "react-native";
import { formatBrDate, formatMonthLong, purchaseWindow, statementMonthKey, usdServices } from "@financas/core";
import { formatBRL, formatUSD } from "@/lib/format";
import { Badge, Banner, Body, Card, Empty, ErrorText, H1, Loading, Money, Screen, SectionTitle, Small } from "@/components/ui";
import { useAnalysis } from "@/lib/analysis";
import { space } from "@/lib/theme";

export default function MonitorCartao() {
  const { data, error, loading, reload } = useAnalysis();
  const view = useMemo(() => {
    if (!data) return null;
    const st = data.statements.find((s) => s.status === "confirmed");
    if (!st) return null;
    return {
      st,
      window: purchaseWindow({ dueDate: st.due_date, closingDate: st.closing_date, bestPurchaseDate: st.best_purchase_date }),
      usd: usdServices(data.txs.filter((t) => !t.hiddenAggregate)),
    };
  }, [data]);

  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <H1>Monitor do cartão</H1>
      {error ? <ErrorText message={error} /> : null}
      {!view ? <Empty title="Sem fatura confirmada" /> : (
        <>
          <Card>
            <SectionTitle>Melhor dia de compra</SectionTitle>
            <Body>
              Compras a partir de <Body style={{ fontWeight: "700" }}>{formatBrDate(view.window.bestDay)}</Body> entram na fatura que vence em {formatBrDate(view.window.bestDayDueDate)}: <Body style={{ fontWeight: "700" }}>{view.window.daysToPayBest} dias</Body> para pagar.
            </Body>
            <Banner tone="warn" title={`Evite comprar até ${formatBrDate(view.window.worstDay)}`}>
              <Small>Entra na fatura que vence em {formatBrDate(view.window.worstDayDueDate)}: só {view.window.daysToPayWorst} dias.</Small>
            </Banner>
            <Small>Calculado a partir do “melhor dia para compras” da fatura de {formatMonthLong(statementMonthKey(view.st.due_date))}. Para compras grandes, vale esperar o melhor dia.</Small>
          </Card>

          <Card>
            <SectionTitle>Limite</SectionTitle>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Body muted>Limite total</Body>
              {view.st.credit_limit_cents ? <Money cents={Number(view.st.credit_limit_cents)} /> : <Small>—</Small>}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Body muted>Disponível na época da fatura</Body>
              {view.st.available_limit_cents ? <Money cents={Number(view.st.available_limit_cents)} /> : <Small>—</Small>}
            </View>
            {view.st.annuity_cents ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Badge label={Number(view.st.annuity_paid_cents ?? 0) === 0 ? "Anuidade isenta" : "Anuidade cobrada"} tone={Number(view.st.annuity_paid_cents ?? 0) === 0 ? "good" : "warn"} />
                <Small>parcela cheia {formatBRL(Number(view.st.annuity_cents))}{view.st.annuity_discount_percent ? ` · desconto ${view.st.annuity_discount_percent}%` : ""}</Small>
              </View>
            ) : null}
          </Card>

          <SectionTitle>Serviços em dólar</SectionTitle>
          {view.usd.length === 0 ? <Body muted>Nenhuma compra em dólar nas faturas importadas.</Body> : null}
          {view.usd.map((s) => (
            <Card key={s.key} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: "700" }} numberOfLines={2}>{s.label}</Body>
                  <Small>{s.charges} cobrança{s.charges > 1 ? "s" : ""} em {s.months} mês{s.months > 1 ? "es" : ""}</Small>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Money cents={s.annualCostCents} bold />
                  <Small>por ano, com IOF</Small>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Stat label="Preço médio" value={formatUSD(s.avgUsdCents)} />
                <Stat label="Câmbio" value={s.lastFx ? `R$ ${s.lastFx.toFixed(4).replace(".", ",")}` : "—"} />
                <Stat label="Variação" value={s.fxChangePercent === null ? "—" : `${s.fxChangePercent > 0 ? "+" : ""}${String(s.fxChangePercent).replace(".", ",")}%`} />
                <Stat label="IOF" value={s.iofPercent === null ? "—" : `${String(s.iofPercent).replace(".", ",")}%`} />
              </View>
              <Small>Média por mês em reais: {formatBRL(s.monthlyCostCents)} (inclui IOF de {formatBRL(s.iofCents)} no período).</Small>
            </Card>
          ))}
          <Small>Renovação do consentimento do Open Finance não se aplica: este app não usa Open Finance.</Small>
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Small>{label}</Small>
      <Body style={{ fontWeight: "600", fontSize: 14 }}>{value}</Body>
    </View>
  );
}
