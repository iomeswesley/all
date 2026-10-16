import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { ALLOWANCE_LEVEL_LABEL, allowanceAfter, allowanceState, partnerAllowanceLabel, type AllowanceLevel, type AllowanceState } from "@financas/core";
import { Badge, Body, Button, Card, Row, Small } from "@/components/ui";
import { fetchAllowance } from "@/lib/allowance";
import { useLoad } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { localToday } from "@/lib/today";
import { space, useTheme, type Theme } from "@/lib/theme";

const levelColor = (t: Theme, level: AllowanceLevel) => (level === "estourou" ? t.danger : level === "perto" ? t.warning : t.primary);
const levelTone = (level: AllowanceLevel) => (level === "estourou" ? "bad" : "warn") as "bad" | "warn";

function Bar({ state, thin }: { state: AllowanceState; thin?: boolean }) {
  const t = useTheme();
  const h = thin ? 6 : 10;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.min(state.percent, 100) }}
      style={{ height: h, borderRadius: h / 2, backgroundColor: t.surfaceAlt, overflow: "hidden" }}
    >
      <View style={{ height: h, width: `${Math.min(state.percent, 100)}%`, borderRadius: h / 2, backgroundColor: levelColor(t, state.level) }} />
    </View>
  );
}

/** Texto de quem é dono da mesada: "restam R$ X · R$ Y/dia" (ou quanto passou). */
export function allowanceMineText(s: AllowanceState): string {
  if (s.remainingCents < 0) return `passou ${formatBRL(s.overCents)} do combinado`;
  if (s.daysLeft <= 0) return `sobraram ${formatBRL(s.remainingCents)}`;
  return `restam ${formatBRL(s.remainingCents)} · ${formatBRL(s.perDayCents)}/dia`;
}

/**
 * Cartão compacto "Dinheiro livre 🔒" do Início: a minha mesada com barra e quanto resta por dia;
 * a do par só como porcentagem (o banco nem devolve os itens).
 */
export function AllowanceCard() {
  const t = useTheme();
  const router = useRouter();
  const today = localToday();
  const month = today.slice(0, 7);
  const { data } = useLoad(() => fetchAllowance(month), [month]);
  if (!data) return null; // carregando ou banco sem a migration: não ocupa espaço

  const mine = data.find((r) => r.isMe);
  const partners = data.filter((r) => !r.isMe && r.monthlyCents !== null);
  if (!mine) return null;

  if (mine.monthlyCents === null && partners.length === 0) {
    return (
      <Card style={{ paddingVertical: 4 }}>
        <Row last onPress={() => router.push("/mesada")}>
          <Ionicons name="lock-closed-outline" size={20} color={t.textSecondary} />
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: "600" }}>Dinheiro livre</Body>
            <Small>Combinem um valor por mês para cada um gastar sem dar satisfação.</Small>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
        </Row>
      </Card>
    );
  }

  const mineState = mine.monthlyCents !== null ? allowanceState({ limitCents: mine.monthlyCents, usedCents: mine.usedCents, month, today }) : null;

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Ionicons name="lock-closed" size={16} color={t.textSecondary} />
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: 16, fontWeight: "700", color: t.text }}>Dinheiro livre</Text>
        <Button title="Ajustar" small variant="ghost" onPress={() => router.push("/mesada")} />
      </View>

      {mineState ? (
        <View style={{ gap: space.xs + 2 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: mineState.level === "estourou" ? t.danger : t.text, fontVariant: ["tabular-nums"] }}>{allowanceMineText(mineState)}</Text>
            {mineState.level !== "ok" ? <Badge label={ALLOWANCE_LEVEL_LABEL[mineState.level]} tone={levelTone(mineState.level)} /> : null}
          </View>
          <Bar state={mineState} />
          <Small>{`Você usou ${formatBRL(mineState.usedCents)} de ${formatBRL(mineState.limitCents)} · só você vê os itens`}</Small>
        </View>
      ) : (
        <Small>Você ainda não tem dinheiro livre combinado.</Small>
      )}

      {partners.map((p) => {
        const s = allowanceState({ limitCents: p.monthlyCents!, usedCents: p.usedCents, month, today });
        return (
          <View key={p.userId} style={{ gap: space.xs, paddingTop: space.xs }} accessible accessibilityLabel={`${p.displayName}: ${partnerAllowanceLabel(s)}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
              <Body numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{p.displayName}</Body>
              <Small style={{ color: s.level === "estourou" ? t.danger : t.textSecondary, fontWeight: "600" }}>{partnerAllowanceLabel(s)}</Small>
            </View>
            <Bar state={s} thin />
          </View>
        );
      })}
    </Card>
  );
}

/** Linha para a tela de lançar: quanto da minha mesada resta e como fica depois deste gasto pessoal. */
export function AllowanceHint({ cents, date }: { cents: number; date: string | null }) {
  const t = useTheme();
  const today = localToday();
  const month = (date ?? today).slice(0, 7);
  const { data } = useLoad(() => fetchAllowance(month), [month]);
  const mine = data?.find((r) => r.isMe);
  if (!mine || mine.monthlyCents === null) return null;
  const now = allowanceState({ limitCents: mine.monthlyCents, usedCents: mine.usedCents, month, today });
  const after = allowanceAfter(now, cents, month, today);
  return (
    <View style={{ gap: space.xs, padding: space.md, borderRadius: 12, backgroundColor: t.surfaceAlt }}>
      <Small style={{ color: t.textSecondary, fontWeight: "600" }}>{`Dinheiro livre: ${allowanceMineText(now)}`}</Small>
      {cents > 0 ? (
        <Small style={{ color: after.level === "estourou" ? t.danger : after.level === "perto" ? t.warning : t.textMuted }}>{`Depois deste gasto: ${allowanceMineText(after)}`}</Small>
      ) : null}
      <Bar state={after} thin />
    </View>
  );
}
