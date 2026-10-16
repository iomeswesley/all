import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { formatBrDate, formatBrDayMonth, formatMonthLong, formatMonthShort, monthKey, ruleForMonth, type MonthSplit, type SplitEntry } from "@financas/core";
import { MODE_LABEL, RuleEditor, SettleSheet } from "@/components/SplitParts";
import { Banner, Body, Button, Card, Empty, ErrorText, Hero, HeroPill, Loading, Money, Row, Screen, SectionTitle, Small } from "@/components/ui";
import { useLoad } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { useReady } from "@/lib/session";
import { addSettlement, deleteSettlement, fetchSplitView, saveMyIncome, saveSplitRule } from "@/lib/split";
import { space, useTheme } from "@/lib/theme";
import { localToday } from "@/lib/today";

/** Acerto do casal: quanto cada um pagou do "nosso", quanto deveria pela regra e quem deve a quem. */
export default function Acerto() {
  const t = useTheme();
  const router = useRouter();
  const { me, partner, householdId } = useReady();
  const { data, error, loading, reload } = useLoad(() => fetchSplitView(me, partner), [me.user_id, partner?.user_id]);
  const [picked, setPicked] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const today = localToday();

  if (!partner) {
    return (
      <Screen>
        <Card>
          <Empty title="Convide seu par para dividir" hint="O acerto mostra quanto cada um pagou do que é “nosso” e quem deve a quem." />
          <Button title="Convidar" onPress={() => router.push("/meu-casal")} />
        </Card>
      </Screen>
    );
  }
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (!data) return <Screen><ErrorText message={error ?? "Não consegui carregar o acerto."} /></Screen>;

  const p = partner;
  const { result } = data;
  const name = (id: string, asObject = false) => (id === me.user_id ? (asObject ? "você" : "Você") : p.display_name);
  const months = result.months.filter((m) => m.count > 0);
  const month = months.find((m) => m.month === picked) ?? months[months.length - 1] ?? null;
  const idx = month ? months.indexOf(month) : -1;
  const currentRule = ruleForMonth(data.rules, monthKey(today));
  const debt = result.debt;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ruleText = (m: MonthSplit) =>
    m.rule.mode === "equal" || m.fallback ? "50/50" : `${MODE_LABEL[m.rule.mode]} · você ${m.shares[me.user_id]}%`;

  const entryNote = (e: SplitEntry, m: MonthSplit) => {
    const o = e.override;
    let split: string;
    if (o?.shareUserId && o.sharePct !== null) {
      const mine = o.shareUserId === me.user_id ? o.sharePct : 100 - o.sharePct;
      split = mine === 100 ? "100% seu" : mine === 0 ? `100% ${p.display_name}` : `você ${mine}% · ${p.display_name} ${100 - mine}%`;
    } else if (e.ownerUserId) {
      split = e.ownerUserId === me.user_id ? "seu" : `de ${p.display_name}`;
    } else split = `nosso · ${ruleText(m)}`;
    return `${formatBrDayMonth(e.postedOn)} · ${name(e.payerUserId!)} pagou · ${split}${o ? " · exceção" : ""}`;
  };

  const entries = month ? [...(result.entriesByMonth[month.month] ?? [])].sort((a, b) => (a.postedOn < b.postedOn ? 1 : -1)) : [];

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Hero
        label={debt ? `${name(debt.fromUserId)} deve a ${name(debt.toUserId, true)}` : "Saldo do “nosso”"}
        value={debt ? formatBRL(debt.amountCents) : "Tudo certo"}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <HeroPill>{`Regra: ${currentRule.mode === "custom" && currentRule.customPct !== null ? `você ${currentRule.customUserId === me.user_id ? currentRule.customPct : 100 - currentRule.customPct}%` : MODE_LABEL[currentRule.mode]}`}</HeroPill>
          {data.settlements[0] ? <HeroPill>{`Último acerto ${formatBrDayMonth(data.settlements[0].settledOn)}`}</HeroPill> : null}
        </View>
      </Hero>

      {debt ? <Button title="Registrar acerto" onPress={() => setSettling(true)} /> : null}
      {message ? <ErrorText message={message} /> : null}

      {result.unknownPayer.length > 0 ? (
        <Banner tone="warn" title={`${result.unknownPayer.length} sem “quem pagou”`}>
          <Small>Ficaram fora da conta. Toque para dizer quem pagou (ex.: Pix lançados antes desta versão ou cartão sem dono).</Small>
          {result.unknownPayer.slice(0, 5).map((e) => (
            <Row key={e.id} onPress={() => router.push({ pathname: "/dividir", params: { id: e.id } })}>
              <Body numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{e.description}</Body>
              <Money cents={e.amountCents} />
              <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
            </Row>
          ))}
        </Banner>
      ) : null}

      {month ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable accessibilityLabel="Mês anterior" disabled={idx <= 0} onPress={() => setPicked(months[idx - 1]!.month)} hitSlop={12} style={{ opacity: idx <= 0 ? 0.3 : 1, padding: 4 }}>
              <Ionicons name="chevron-back" size={22} color={t.text} />
            </Pressable>
            <Text accessibilityRole="header" style={{ color: t.text, fontWeight: "700", fontSize: 17, textTransform: "capitalize" }}>{formatMonthLong(month.month)}</Text>
            <Pressable accessibilityLabel="Próximo mês" disabled={idx >= months.length - 1} onPress={() => setPicked(months[idx + 1]!.month)} hitSlop={12} style={{ opacity: idx >= months.length - 1 ? 0.3 : 1, padding: 4 }}>
              <Ionicons name="chevron-forward" size={22} color={t.text} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Body muted>Dividido no mês ({month.count})</Body>
            <Money cents={month.totalCents} bold style={{ fontSize: 18 }} />
          </View>
          <Small>{ruleText(month)}</Small>
          {month.fallback ? <Small style={{ color: t.warning }}>A regra pela renda precisa das duas rendas; este mês ficou em 50/50.</Small> : null}

          <View style={{ gap: space.sm, paddingTop: space.xs }}>
            <View style={{ flexDirection: "row" }}>
              <Small style={{ flex: 1.2 }}> </Small>
              <Small style={{ flex: 1, textAlign: "right" }}>Pagou</Small>
              <Small style={{ flex: 1, textAlign: "right" }}>Deveria</Small>
              <Small style={{ flex: 1, textAlign: "right" }}>Diferença</Small>
            </View>
            {result.users.map((u, i) => (
              <View key={u} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1.2, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.series[i] }} />
                  <Body numberOfLines={1} style={{ fontWeight: "600", flexShrink: 1 }}>{name(u)}</Body>
                </View>
                <Money cents={month.paid[u]!} style={{ flex: 1, textAlign: "right", fontSize: 14 }} />
                <Money cents={month.owed[u]!} style={{ flex: 1, textAlign: "right", fontSize: 14 }} />
                <Money cents={month.net[u]!} signed bold color={month.net[u]! > 0 ? t.success : month.net[u]! < 0 ? t.danger : t.text} style={{ flex: 1, textAlign: "right", fontSize: 14 }} />
              </View>
            ))}
          </View>
          <Small>
            {month.net[me.user_id] === 0
              ? "No mês, cada um pagou exatamente a sua parte."
              : `Em ${formatMonthShort(month.month)}, ${name(month.net[me.user_id]! > 0 ? me.user_id : p.user_id)} pagou ${formatBRL(Math.abs(month.net[me.user_id]!))} a mais do que a sua parte.`}
            {month.settled[me.user_id] !== 0 ? ` Acertos no mês: ${formatBRL(Math.abs(month.settled[me.user_id]!))}.` : ""}
          </Small>
        </Card>
      ) : (
        <Card>
          <Empty title="Nada para dividir ainda" hint="Os lançamentos “nossos” das faturas confirmadas e do Pix e dinheiro aparecem aqui." />
        </Card>
      )}

      {month && entries.length > 0 ? (
        <Card style={{ gap: 0 }}>
          <SectionTitle right={<Small>toque para dividir diferente</Small>}>Lançamentos</SectionTitle>
          {(showAll ? entries : entries.slice(0, 8)).map((e, i, arr) => (
            <Row key={e.id} last={i === arr.length - 1} onPress={() => router.push({ pathname: "/dividir", params: { id: e.id } })}>
              <View style={{ flex: 1, gap: 2 }}>
                <Body numberOfLines={1} style={{ fontWeight: "500" }}>{e.description}</Body>
                <Small>{entryNote(e, month)}</Small>
              </View>
              <Money cents={e.amountCents} color={e.amountCents < 0 ? t.success : undefined} />
            </Row>
          ))}
          {entries.length > 8 ? <Button title={showAll ? "Mostrar menos" : `Ver todos (${entries.length})`} variant="ghost" small onPress={() => setShowAll(!showAll)} /> : null}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Regra do casal</SectionTitle>
        <RuleEditor
          key={JSON.stringify([currentRule, data.myIncomeCents])}
          me={me}
          partner={p}
          current={currentRule}
          informed={data.informed}
          incomeShares={data.incomeShares}
          myIncomeCents={data.myIncomeCents}
          busy={busy}
          onSaveRule={(r) => void run(() => saveSplitRule(householdId, { ...r, month: monthKey(today) }))}
          onSaveIncome={(cents) => void run(() => saveMyIncome(householdId, me.user_id, cents))}
        />
        <Small>Gasto pessoal 🔒 nunca entra na divisão. Para uma exceção (“este foi 100% meu”, 70/30), toque no lançamento.</Small>
      </Card>

      <Card style={{ gap: 0 }}>
        <SectionTitle>Histórico de acertos</SectionTitle>
        {data.settlements.length === 0 ? <Body muted style={{ paddingTop: space.sm }}>Nenhum acerto registrado.</Body> : null}
        {data.settlements.map((s, i) => (
          <Row
            key={s.id}
            last={i === data.settlements.length - 1}
            onPress={s.createdBy === me.user_id ? () => Alert.alert("Desfazer este acerto?", "Ele deixa de abater o saldo.", [
              { text: "Cancelar", style: "cancel" },
              { text: "Desfazer", style: "destructive", onPress: () => void run(() => deleteSettlement(s.id)) },
            ]) : undefined}
          >
            <Ionicons name="swap-horizontal" size={20} color={t.textSecondary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Body style={{ fontWeight: "500" }}>{s.fromUserId && s.toUserId ? `${name(s.fromUserId)} → ${name(s.toUserId, true)}` : "Acerto"}</Body>
              <Small>{formatBrDate(s.settledOn)}{s.note ? ` · ${s.note}` : ""}{s.createdBy === me.user_id ? " · toque para desfazer" : ""}</Small>
            </View>
            <Money cents={s.amountCents} bold />
          </Row>
        ))}
        {!debt ? <Button title="Registrar acerto" variant="ghost" small onPress={() => setSettling(true)} /> : null}
      </Card>

      <SettleSheet
        visible={settling}
        me={me}
        partner={p}
        debt={debt}
        today={today}
        onClose={() => setSettling(false)}
        onSave={(s) => void run(async () => {
          await addSettlement(householdId, { ...s, createdBy: me.user_id });
          setSettling(false);
        })}
      />
    </Screen>
  );
}
