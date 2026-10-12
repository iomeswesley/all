import { useMemo } from "react";
import { View } from "react-native";
import { categoryName, detectRecurring, formatMonthShort, type RecurringAlert } from "@financas/core";
import { Badge, Body, Card, Empty, ErrorText, Loading, Money, Screen, SectionTitle, Small } from "@/components/ui";
import { latestStatementMonth, useAnalysis } from "@/lib/analysis";
import { space } from "@/lib/theme";
import { formatBRL } from "@/lib/format";

const ALERT: Record<RecurringAlert, { label: string; tone: "warn" | "bad" | "neutral" }> = {
  duplicada: { label: "Cobrança duplicada", tone: "bad" },
  mudou_valor: { label: "Mudou de valor", tone: "warn" },
  encerrada: { label: "Não veio no último mês", tone: "neutral" },
};

export default function Recorrencias() {
  const analysis = useAnalysis();
  const { error, loading, reload } = analysis;
  const data = analysis.data?.txs ?? null;
  const report = useMemo(() => {
    if (!data || data.length === 0) return null;
    const latest = latestStatementMonth(analysis.data!) ?? "";
    return { latest, ...detectRecurring(data, latest) };
  }, [data, analysis.data]);

  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      {error ? <ErrorText message={error} /> : null}
      {!report ? (
        <Empty title="Sem dados ainda" hint="Importe pelo menos duas faturas para detectar cobranças que se repetem todo mês." />
      ) : (
        <>
          <Card>
            <Small>Custo das recorrências ativas</Small>
            <Money cents={report.monthlyTotalCents} bold style={{ fontSize: 28 }} />
            <Body muted>por mês · {formatBRL(report.annualTotalCents)} por ano</Body>
          </Card>

          {report.newSubscriptions.length > 0 ? (
            <Card>
              <SectionTitle>Assinatura nova neste mês</SectionTitle>
              {report.newSubscriptions.map((n) => (
                <View key={n.key} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                  <Body style={{ flex: 1 }}>{n.label}</Body>
                  <Money cents={n.amountCents} />
                </View>
              ))}
              <Small>Apareceu pela primeira vez. Se não foi você, contate o emissor.</Small>
            </Card>
          ) : null}

          {report.items.length === 0 ? (
            <Empty title="Nenhuma recorrência detectada" hint="Preciso ver o mesmo estabelecimento em dois meses seguidos, com valor parecido." />
          ) : (
            report.items.map((i) => (
              <Card key={i.key} style={{ opacity: i.active ? 1 : 0.7 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: "600" }}>{i.label}</Body>
                    <Small>{categoryName(i.categoryId)} · {i.months.length} meses · desde {formatMonthShort(i.months[0]!)}{i.inUsd ? " · em dólar" : ""}</Small>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Money cents={i.typicalCents} bold />
                    <Small>{formatBRL(i.annualCents)}/ano</Small>
                  </View>
                </View>
                {i.alerts.length > 0 ? (
                  <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                    {i.alerts.map((a) => <Badge key={a} label={ALERT[a].label} tone={ALERT[a].tone} />)}
                  </View>
                ) : null}
              </Card>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
