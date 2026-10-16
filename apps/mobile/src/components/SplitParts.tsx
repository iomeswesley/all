import { useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import { formatBrDate, formatNumberBR, parseBrDate, tryParseBRL, type Debt, type SplitMode, type SplitRule } from "@financas/core";
import { Body, Button, Chip, ErrorText, Money, Segmented, SectionTitle, Small } from "@/components/ui";
import type { Member } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

export const MODE_LABEL: Record<SplitMode, string> = { equal: "50/50", income: "Pela renda", custom: "Personalizado" };

export function useInputStyle() {
  const t = useTheme();
  return { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 12, fontSize: 16, color: t.text, backgroundColor: t.surface } as const;
}

/** Barra dupla "fulano X% · sicrano Y%". */
export function ShareBar({ left, right, leftLabel, rightLabel }: { left: number; right: number; leftLabel: string; rightLabel: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${leftLabel} ${left}%, ${rightLabel} ${right}%`}>
      <View style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: t.surfaceAlt }}>
        <View style={{ flex: Math.max(left, 0.0001), backgroundColor: t.series[0] }} />
        <View style={{ width: 2, backgroundColor: t.surface }} />
        <View style={{ flex: Math.max(right, 0.0001), backgroundColor: t.series[1] }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Small>{leftLabel} · {left}%</Small>
        <Small>{rightLabel} · {right}%</Small>
      </View>
    </View>
  );
}

/** Configuração da regra do casal. */
export function RuleEditor({ me, partner, current, informed, incomeShares, myIncomeCents, busy, onSaveRule, onSaveIncome }: {
  me: Member; partner: Member; current: SplitRule; informed: Record<string, boolean>; incomeShares: Record<string, number> | null; myIncomeCents: number | null; busy: boolean;
  onSaveRule: (r: { mode: SplitMode; customUserId: string | null; customPct: number | null; fromStart: boolean }) => void;
  onSaveIncome: (cents: number) => void;
}) {
  const input = useInputStyle();
  const t = useTheme();
  const currentMyPct = current.mode === "custom" && current.customPct !== null ? (current.customUserId === me.user_id ? current.customPct : 100 - current.customPct) : 50;
  const [mode, setMode] = useState<SplitMode>(current.mode);
  const [myPct, setMyPct] = useState(String(currentMyPct));
  const [income, setIncome] = useState(myIncomeCents !== null ? formatNumberBR(myIncomeCents) : "");
  const [scope, setScope] = useState<"month" | "all">("month");
  const [error, setError] = useState<string | null>(null);

  const pct = Number(myPct);
  const pctOk = /^\d{1,3}$/.test(myPct.trim()) && pct >= 0 && pct <= 100;
  const partnerInformed = informed[partner.user_id] ?? false;

  function save() {
    setError(null);
    if (mode === "custom" && !pctOk) return setError("Informe a sua parte de 0 a 100%.");
    onSaveRule({ mode, customUserId: mode === "custom" ? me.user_id : null, customPct: mode === "custom" ? pct : null, fromStart: scope === "all" });
  }
  function saveIncome() {
    setError(null);
    const cents = tryParseBRL(income);
    if (cents === null || cents < 0) return setError("Renda inválida. Use o formato 5.000,00.");
    onSaveIncome(cents);
  }

  return (
    <View style={{ gap: space.md }}>
      <Segmented options={(["equal", "income", "custom"] as SplitMode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))} value={mode} onChange={setMode} />
      {mode === "equal" ? <Small>Cada um arca com metade do que é “nosso”.</Small> : null}

      {mode === "income" ? (
        <View style={{ gap: space.sm }}>
          <Small>Cada um informa a própria renda mensal. {partner.display_name} vê só a proporção resultante, nunca o valor.</Small>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
            <TextInput style={[input, { flex: 1 }]} placeholder="Sua renda (ex.: 5.000,00)" placeholderTextColor={t.textMuted} keyboardType="numbers-and-punctuation" value={income} onChangeText={setIncome} accessibilityLabel="Sua renda mensal" />
            <Button title="Salvar renda" small variant="secondary" onPress={saveIncome} disabled={busy} />
          </View>
          {incomeShares ? (
            <ShareBar left={incomeShares[me.user_id] ?? 50} right={incomeShares[partner.user_id] ?? 50} leftLabel="Você" rightLabel={partner.display_name} />
          ) : (
            <Small>{partnerInformed ? "Falta você informar a sua renda." : `Aguardando ${partner.display_name} informar a renda. Até lá, vale 50/50.`}</Small>
          )}
        </View>
      ) : null}

      {mode === "custom" ? (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {[60, 70, 40, 30].map((p) => <Chip key={p} label={`${p}/${100 - p}`} selected={pctOk && pct === p} onPress={() => setMyPct(String(p))} />)}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Body style={{ flex: 1 }}>Sua parte (%)</Body>
            <TextInput style={[input, { width: 90, textAlign: "center" }]} keyboardType="number-pad" value={myPct} onChangeText={setMyPct} maxLength={3} accessibilityLabel="Sua parte em porcentagem" />
          </View>
          {pctOk ? <ShareBar left={pct} right={100 - pct} leftLabel="Você" rightLabel={partner.display_name} /> : null}
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <Small>Vale para</Small>
        <Segmented options={[{ value: "month", label: "Deste mês em diante" }, { value: "all", label: "Todo o histórico" }]} value={scope} onChange={setScope} />
      </View>
      {error ? <ErrorText message={error} /> : null}
      <Button title="Salvar regra" onPress={save} loading={busy} />
    </View>
  );
}

/** Folha para registrar um acerto feito fora do app (Pix, dinheiro). */
export function SettleSheet({ visible, me, partner, debt, today, onClose, onSave }: {
  visible: boolean; me: Member; partner: Member; debt: Debt | null; today: string; onClose: () => void;
  onSave: (s: { fromUserId: string; toUserId: string; amountCents: number; settledOn: string; note: string | null }) => void;
}) {
  const t = useTheme();
  const input = useInputStyle();
  const [shown, setShown] = useState(false);
  const [from, setFrom] = useState<string>(me.user_id);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (visible !== shown) {
    setShown(visible);
    if (visible) {
      setFrom(debt?.fromUserId ?? me.user_id);
      setAmount(debt ? formatNumberBR(debt.amountCents) : "");
      setDate(formatBrDate(today));
      setNote("");
      setError(null);
    }
  }
  const to = from === me.user_id ? partner.user_id : me.user_id;
  const name = (id: string) => (id === me.user_id ? "Você" : partner.display_name);

  function save() {
    const cents = tryParseBRL(amount);
    if (cents === null || cents <= 0) return setError("Valor inválido. Use o formato 123,45.");
    let iso: string;
    try { iso = parseBrDate(date.trim()); } catch { return setError("Data inválida. Use dd/mm/aaaa."); }
    if (iso > today) return setError("A data não pode ser no futuro.");
    onSave({ fromUserId: from, toUserId: to, amountCents: cents, settledOn: iso, note: note.trim() || null });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "#0008" }} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={{ backgroundColor: t.surface, padding: space.lg, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
        <SectionTitle>Registrar acerto</SectionTitle>
        <Small>O Pix ou dinheiro é feito fora do app; aqui só fica registrado para abater o saldo.</Small>
        <Segmented
          options={[{ value: me.user_id, label: `Você pagou ${partner.display_name}` }, { value: partner.user_id, label: `${partner.display_name} pagou você` }]}
          value={from}
          onChange={setFrom}
        />
        <TextInput style={[input, { fontSize: 24, fontWeight: "700" }]} placeholder="R$ 0,00" placeholderTextColor={t.textMuted} keyboardType="numbers-and-punctuation" value={amount} onChangeText={setAmount} accessibilityLabel="Valor do acerto" />
        {debt ? (
          <Small>
            Saldo atual: {name(debt.fromUserId)} deve <Money cents={debt.amountCents} style={{ fontSize: 12.5 }} color={t.textMuted} /> a {debt.toUserId === me.user_id ? "você" : partner.display_name}.
          </Small>
        ) : null}
        <TextInput style={input} placeholder="Data (dd/mm/aaaa)" placeholderTextColor={t.textMuted} value={date} onChangeText={setDate} accessibilityLabel="Data do acerto" />
        <TextInput style={input} placeholder="Observação (opcional)" placeholderTextColor={t.textMuted} value={note} onChangeText={setNote} maxLength={120} accessibilityLabel="Observação" />
        {error ? <ErrorText message={error} /> : null}
        <Button title="Registrar" onPress={save} />
        <Button title="Cancelar" variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}
