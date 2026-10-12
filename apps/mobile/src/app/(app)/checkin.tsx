import { useMemo, useState } from "react";
import { Share, View } from "react-native";
import { buildCheckin, categoryName, formatMonthLong, formatMonthShort, addMonthsToKey, statementMonthKey } from "@financas/core";
import { Badge, Banner, Body, Button, Card, ErrorText, H1, Loading, Money, Screen, SectionTitle, Small } from "@/components/ui";
import { budgetsFor, defaultMonth, monthsOf, useAnalysis } from "@/lib/analysis";
import { space, useTheme } from "@/lib/theme";
import { formatBRL } from "@/lib/format";

export default function Checkin() {
  const t = useTheme();
  const { data, error, loading, reload } = useAnalysis();
  const [picked, setPicked] = useState<string | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const months = monthsOf(data.txs);
    const month = picked && months.includes(picked) ? picked : defaultMonth(data, months);
    if (!month) return null;
    const st = data.statements.find((s) => s.status === "confirmed" && statementMonthKey(s.due_date) === month);
    const ci = buildCheckin({
      month,
      txs: data.txs,
      budgets: budgetsFor(data.budgetRows, month),
      annuity: st ? { installmentCents: st.annuity_cents, paidCents: st.annuity_paid_cents, discountPercent: st.annuity_discount_percent } : null,
    });
    return { months, month, ci };
  }, [data, picked]);

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (!view) return <Screen><H1>Check-in</H1>{error ? <ErrorText message={error} /> : <Body muted>Confirme uma fatura para ver o resumo do mês.</Body>}</Screen>;

  const { ci, month, months } = view;
  const idx = months.indexOf(month);
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <H1>Check-in do mês</H1>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Button title="‹" variant="ghost" small disabled={idx === 0} onPress={() => setPicked(months[idx - 1]!)} />
          <Body style={{ fontWeight: "700" }}>{formatMonthLong(month)}</Body>
          <Button title="›" variant="ghost" small disabled={idx === months.length - 1} onPress={() => setPicked(months[idx + 1]!)} />
        </View>
        <Money cents={ci.totalCents} bold style={{ fontSize: 32 }} />
        {ci.deltaCents !== null ? (
          <Body muted>
            {ci.deltaCents === 0 ? "Igual" : `${ci.deltaCents > 0 ? "▲" : "▼"} ${formatBRL(Math.abs(ci.deltaCents))}${ci.deltaPercent !== null ? ` (${Math.abs(ci.deltaPercent)}%)` : ""}`} vs {formatMonthShort(addMonthsToKey(month, -1))}
          </Body>
        ) : (
          <Small>Primeira fatura: sem comparação ainda.</Small>
        )}
      </Card>

      {ci.recommendations.length > 0 ? (
        <>
          <SectionTitle>Recomendações</SectionTitle>
          {ci.recommendations.map((r, i) => (
            <Card key={r.id} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                <Body style={{ flex: 1, fontWeight: "600" }}>{i + 1}. {r.title}</Body>
                <View style={{ alignItems: "flex-end" }}>
                  <Money cents={r.savingsCentsPerMonth} bold color={t.success} />
                  <Small>{r.estimate ? "estimado/mês" : "por mês"}</Small>
                </View>
              </View>
              <Body muted>{r.detail}</Body>
            </Card>
          ))}
          <Banner tone="good" title={`Potencial: até ${formatBRL(ci.estimatedSavingsCents)} por mês`}>
            <Small>Soma das recomendações acima. Valores marcados “estimado” são aproximações, não cobranças confirmadas.</Small>
          </Banner>
        </>
      ) : (
        <Banner tone="good" title="Nada urgente neste mês">
          <Small>Sem juros, duplicidades ou categorias muito acima da média.</Small>
        </Banner>
      )}

      {ci.risers.length > 0 || ci.fallers.length > 0 ? (
        <Card>
          <SectionTitle>O que mudou</SectionTitle>
          {ci.risers.map((c) => <ChangeLine key={c.key} label={c.label} cents={c.diffCents} />)}
          {ci.fallers.map((c) => <ChangeLine key={c.key} label={c.label} cents={c.diffCents} />)}
        </Card>
      ) : null}

      {ci.newMerchants.length > 0 ? (
        <Card>
          <SectionTitle>Novos estabelecimentos</SectionTitle>
          {ci.newMerchants.map((m) => (
            <View key={m.key} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
              <Body numberOfLines={1} style={{ flex: 1 }}>{m.label}</Body>
              <Money cents={m.currentCents} />
            </View>
          ))}
        </Card>
      ) : null}

      {ci.budgets.some((b) => b.level !== "ok") ? (
        <Card>
          <SectionTitle>Orçamento</SectionTitle>
          {ci.budgets.filter((b) => b.level !== "ok").map((b) => (
            <View key={b.categoryId} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, alignItems: "center" }}>
              <Body style={{ flex: 1 }} numberOfLines={1}>{categoryName(b.categoryId)}</Body>
              <Badge label={`${b.percent}%`} tone={b.level === "over100" ? "bad" : "warn"} />
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Encargos do mês</SectionTitle>
        {ci.charges.totalCents === 0 && !ci.charges.annuity ? <Body muted>Nenhum encargo. 👏</Body> : null}
        {ci.charges.iofCents > 0 ? <Line label="IOF (exterior)" cents={ci.charges.iofCents} /> : null}
        {ci.charges.lateCents > 0 ? <Line label="Juros, multa e mora" cents={ci.charges.lateCents} bad /> : null}
        {ci.charges.byType.seguro > 0 ? <Line label="Seguros" cents={ci.charges.byType.seguro} /> : null}
        {ci.charges.annuity ? (
          <Small>
            Anuidade: {ci.charges.annuity.waived ? `isenta (${ci.charges.annuity.discountPercent}%) — economiza ${formatBRL(ci.charges.annuity.savedPerMonthCents)} por mês` : `${formatBRL(ci.charges.annuity.paidCents)} cobrados`}.
            {ci.charges.annuity.waived ? " Confira se a condição da isenção continua valendo." : ""}
          </Small>
        ) : null}
      </Card>

      <Button title="Compartilhar resumo" variant="secondary" onPress={() => void Share.share({ message: ci.text })} />
    </Screen>
  );
}

function ChangeLine({ label, cents }: { label: string; cents: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
      <Body numberOfLines={1} style={{ flex: 1 }}>{cents > 0 ? "▲" : "▼"} {label}</Body>
      <Money cents={cents} signed color={cents > 0 ? t.warning : t.success} />
    </View>
  );
}

function Line({ label, cents, bad }: { label: string; cents: number; bad?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
      <Body style={{ flex: 1 }}>{label}</Body>
      <Money cents={cents} color={bad ? t.danger : undefined} bold={bad} />
    </View>
  );
}
