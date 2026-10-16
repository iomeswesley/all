import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { detectPriceChanges, formatMonthShort, type PriceChange, type PriceChangeStatus, type PriceTx } from "@financas/core";
import { Badge, Body, Card, Row, SectionTitle, Small } from "@/components/ui";
import { formatBRL, formatUSD } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { space, useTheme } from "@/lib/theme";

const BADGE: Record<Exclude<PriceChangeStatus, "igual" | "nova">, { label: string; tone: "warn" | "good" | "neutral" }> = {
  aumentou: { label: "Aumentou", tone: "warn" },
  caiu: { label: "Caiu", tone: "good" },
  cambio: { label: "Câmbio", tone: "neutral" },
  sumiu: { label: "Não veio", tone: "neutral" },
};

/** R$ 60,00 → "R$ 60" (valores redondos ficam mais leves na tela) */
const brlShort = (cents: number) => formatBRL(cents).replace(/,00$/, "");
const signed = (cents: number) => `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${brlShort(Math.abs(cents))}`;

/** "de R$ 39,90 para R$ 44,90 · +R$ 60/ano" */
export function priceChangeLine(c: PriceChange, month: string): string {
  if (c.status === "sumiu") return `${formatBRL(c.fromCents ?? 0)} não veio em ${formatMonthShort(month)}`;
  if (c.status === "nova") return `nova · ${signed(c.annualDiffCents)}/ano`;
  const base = `de ${formatBRL(c.fromCents ?? 0)} para ${formatBRL(c.toCents ?? 0)} · ${signed(c.annualDiffCents)}/ano`;
  return c.status === "cambio" && c.toUsdCents ? `${base} · mesmo ${formatUSD(c.toUsdCents)}` : base;
}

function usePriceChanges(txs: readonly PriceTx[] | null | undefined, month: string | null | undefined) {
  return useMemo(() => (txs && txs.length && month ? detectPriceChanges(txs, month) : null), [txs, month]);
}

/** Início: cartão compacto, só quando alguma assinatura/conta aumentou no mês. */
export function PriceChangesCard({ txs, month }: { txs: readonly PriceTx[] | null | undefined; month: string | null | undefined }) {
  usePrefs();
  const t = useTheme();
  const router = useRouter();
  const report = usePriceChanges(txs, month);
  if (!report || report.increases.length === 0) return null;
  const shown = report.increases.slice(0, 3);
  return (
    <Card style={{ paddingVertical: 4, gap: 0 }}>
      <View style={{ paddingTop: 12 }}>
        <SectionTitle right={<Text style={{ color: t.warning, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{signed(report.increaseAnnualCents)}/ano</Text>}>
          Assinaturas que mudaram
        </SectionTitle>
      </View>
      {shown.map((c, i) => (
        <Row key={c.key} last={i === shown.length - 1} onPress={() => router.push("/recorrencias")}>
          <Ionicons name="trending-up" size={20} color={t.warning} />
          <View style={{ flex: 1, gap: 2 }}>
            <Body numberOfLines={1} style={{ fontWeight: "600" }}>{c.label}</Body>
            <Small>de {formatBRL(c.fromCents ?? 0)} para {formatBRL(c.toCents ?? 0)}</Small>
          </View>
          <Text style={{ color: t.warning, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{signed(c.annualDiffCents)}/ano</Text>
        </Row>
      ))}
    </Card>
  );
}

/** Recorrências: destaca o que mudou de valor (aumento, queda, câmbio, não veio). */
export function PriceChangeList({ txs, month }: { txs: readonly PriceTx[] | null | undefined; month: string | null | undefined }) {
  usePrefs();
  const report = usePriceChanges(txs, month);
  const items = report?.items.filter((c): c is PriceChange & { status: keyof typeof BADGE } => c.status !== "nova" && c.status !== "igual") ?? [];
  if (!report || items.length === 0) return null;
  return (
    <Card style={{ paddingVertical: 4, gap: 0 }}>
      <View style={{ paddingTop: 12 }}><SectionTitle>Mudaram de valor</SectionTitle></View>
      {items.map((c, i) => (
        <Row key={c.key} last={i === items.length - 1}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Body numberOfLines={1} style={{ flexShrink: 1, fontWeight: "600" }}>{c.label}</Body>
              <Badge label={BADGE[c.status].label} tone={BADGE[c.status].tone} />
            </View>
            <Small>{priceChangeLine(c, report.month)}</Small>
          </View>
        </Row>
      ))}
    </Card>
  );
}
