import { useLocalSearchParams, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useMemo, useState } from "react";
import { Alert, Modal, TextInput, View } from "react-native";
import { formatBrDate, formatMonthLong, parseBrDate, sha256Hex, statementMonthKey, tryParseBRL, type ReconcileCheck } from "@financas/core";
import { CategorySheet, type CategoryChoice } from "@/components/CategorySheet";
import { TxItem } from "@/components/TxItem";
import { useTxThreads } from "@/components/TxThread";
import { Badge, Banner, Body, Button, Card, ErrorText, Loading, Money, Screen, SectionTitle, Small } from "@/components/ui";
import { STATEMENT_COLUMNS, useLoad, type StatementRow } from "@/lib/data";
import { applyCategory, confirmStatement, discardStatement, fetchHiddenSums, notifyConfirmed, reconcileStatement, refreshReconciliation, setPrivate, toTxFull, TX_FULL_COLUMNS, type TxFull } from "@/lib/mutations";
import { useReady } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { radius, space, useTheme } from "@/lib/theme";
import { formatBRL } from "@/lib/format";

const SECTIONS: { key: string; title: string; test: (t: TxFull) => boolean }[] = [
  { key: "parcelas", title: "Parcelas", test: (t) => t.kind === "parcela" },
  { key: "avista", title: "À vista", test: (t) => t.kind === "avista" },
  { key: "encargos", title: "Encargos e tarifas (IOF, anuidade…)", test: (t) => t.kind === "encargo" },
  { key: "estornos", title: "Estornos e créditos", test: (t) => t.kind === "estorno" },
  { key: "pagamentos", title: "Pagamentos e entradas (não contam como gasto)", test: (t) => t.kind === "pagamento" },
];

export default function ConferirFatura() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useTheme();
  const { me, partner } = useReady();

  const { data, error, loading, reload } = useLoad(async () => {
    const [st, tx, hidden] = await Promise.all([
      supabase.from("statements").select(STATEMENT_COLUMNS).eq("id", id).single(),
      supabase.from("transactions").select(TX_FULL_COLUMNS).eq("statement_id", id).order("posted_on").order("id"),
      fetchHiddenSums(String(id)),
    ]);
    if (st.error) throw new Error(st.error.message);
    if (tx.error) throw new Error(tx.error.message);
    return { statement: st.data as unknown as StatementRow, txs: (tx.data ?? []).map((r) => toTxFull(r as Record<string, unknown>)), hidden };
  }, [id]);

  const [sheetFor, setSheetFor] = useState<TxFull | null>(null);
  const [editing, setEditing] = useState<TxFull | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const threads = useTxThreads((data?.txs ?? []).map((x) => x.id));
  const live = useMemo(() => (data ? reconcileStatement(data.statement, data.txs, data.hidden) : null), [data]);
  const ownerLabel = (uid: string | null) => (uid === null ? null : uid === me.user_id ? "meu" : partner?.display_name ?? "dela(e)");

  if (loading && !data) return <Screen><Loading /></Screen>;
  if (!data || !live) return <Screen><ErrorText message={error ?? "Fatura não encontrada."} /></Screen>;
  const { statement, txs } = data;
  const confirmed = statement.status === "confirmed";

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

  const choose = (tx: TxFull) => (c: CategoryChoice) =>
    run(async () => {
      setSheetFor(null);
      await applyCategory({ description: tx.description_raw, txId: tx.id, categoryId: c.categoryId, ownerUserId: c.ownerUserId, always: c.always });
      if (c.isPrivate) await setPrivate([tx.id], me.user_id, true);
    });

  function confirm() {
    const force = live!.status === "fail";
    const go = () =>
      run(async () => {
        await confirmStatement(statement.id, force);
        const res = await notifyConfirmed(statement.id); // melhor esforço: nunca desfaz a confirmação
        const alerts = res?.alerts ?? [];
        if (alerts.length > 0) Alert.alert("Atenção ao orçamento", alerts.map((a) => `• ${a.title}\n  ${a.body}`).join("\n\n"));
        router.back();
      });
    if (!force) return void go();
    Alert.alert(
      "A soma não bate",
      `Há uma diferença de ${formatBRL(live!.totalDiffCents)} entre os lançamentos e o total da fatura. Revise os lançamentos acima. Se você sabe que está certo, pode confirmar mesmo assim — a diferença fica registrada.`,
      [{ text: "Voltar e revisar", style: "cancel" }, { text: "Confirmar mesmo assim", style: "destructive", onPress: go }],
    );
  }

  function discard() {
    Alert.alert("Descartar esta fatura?", "Os lançamentos e o PDF enviado serão apagados. Você pode importar de novo depois.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Descartar", style: "destructive", onPress: () => void run(async () => { await discardStatement(statement); router.back(); }) },
    ]);
  }

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <View style={{ gap: 2 }}>
        <Body style={{ fontSize: 22, fontWeight: "700" }}>{formatMonthLong(statementMonthKey(statement.due_date))}</Body>
        <Small>Vence {formatBrDate(statement.due_date)} · fecha {formatBrDate(statement.closing_date)}</Small>
      </View>

      {confirmed ? (
        <Banner tone="good" title="Fatura confirmada">
          <Small>{statement.forced_diff_cents ? `Confirmada com diferença de ${formatBRL(statement.forced_diff_cents)} aceita manualmente.` : "Entra no dashboard e nas projeções."}</Small>
        </Banner>
      ) : live.status === "unverified" ? (
        <Banner tone="warn" title="Sem total do banco para conferir">
          <Small>Este arquivo ({statement.format === "ofx" ? "OFX" : "JSON"}) não traz o total da fatura, então não consigo garantir que a soma bate. Confira os valores e o número de lançamentos antes de confirmar.</Small>
        </Banner>
      ) : live.status === "ok" ? (
        <Banner tone="good" title="A soma confere">
          <Small>Os lançamentos fecham exatamente com o total da fatura.</Small>
        </Banner>
      ) : live.status === "rounding" ? (
        <Banner tone="warn" title="A soma confere (com arredondamento de parcelas)">
          <Small>O total fecha. Só a projeção de parcelas futuras difere por centavos de arredondamento do banco.</Small>
        </Banner>
      ) : (
        <Banner tone="bad" title={`Diferença de ${formatBRL(Math.abs(live.totalDiffCents))}`}>
          <Small>{live.totalDiffCents > 0 ? "Os lançamentos somam MAIS que o total da fatura." : live.totalDiffCents < 0 ? "Os lançamentos somam MENOS que o total da fatura." : "Outra conferência não fecha (veja abaixo)."} Revise antes de salvar.</Small>
        </Banner>
      )}

      {data.hidden.expensesCents !== 0 || data.hidden.futureCents !== 0 ? (
        <Small>🔒 Há gastos pessoais de {partner?.display_name ?? "seu par"} nesta fatura. Você vê só o total (já incluído na conferência abaixo), não os itens.</Small>
      ) : null}

      <Card>
        <SectionTitle>Conferência</SectionTitle>
        {live.status === "unverified" ? null : <Line label={statement.format === "santander_pdf" ? "Total da fatura (banco)" : "Total informado"} cents={statement.declared_total_cents} bold />}
        <Line label="Total calculado (lançamentos)" cents={live.computedTotalCents} bold />
        {live.checks.map((c) => <CheckRow key={c.id} check={c} />)}
        <Small>{statement.format === "santander_pdf" ? "Total = saldo anterior + lançamentos − pagamentos − créditos. Parcelas futuras = soma de (parcelas restantes × valor) das compras parceladas." : "Total = compras − estornos (pagamentos e entradas ficam de fora)."}</Small>
      </Card>

      {SECTIONS.map((sec) => {
        const items = txs.filter(sec.test);
        if (items.length === 0) return null;
        const sum = items.reduce((a, x) => a + x.amountCents, 0);
        return (
          <Card key={sec.key} style={{ gap: 0 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: space.sm }}>
              <SectionTitle>{sec.title} ({items.length})</SectionTitle>
              <Money cents={sum} bold />
            </View>
            {items.map((x) => (
              <TxItem
                key={x.id}
                tx={{ id: x.id, postedOn: x.posted_on, descriptionClean: x.description_clean, amountCents: x.amountCents, amountUsdCents: x.amountUsdCents, categoryId: x.category_id, installmentN: x.installmentN, installmentTotal: x.installmentTotal, needsReview: x.needs_review, ownerLabel: ownerLabel(x.owner_user_id), isPrivate: x.is_private }}
                onPress={x.kind === "pagamento" ? undefined : () => setSheetFor(x)}
                onMore={() => setEditing(x)}
                thread={threads.badge({ id: x.id, description: x.description_clean, amountCents: x.amountCents, isPrivate: x.is_private })}
              />
            ))}
          </Card>
        );
      })}

      {message ? <ErrorText message={message} /> : null}
      {!confirmed ? (
        <View style={{ gap: space.sm }}>
          <Button title="Adicionar lançamento que faltou" variant="secondary" onPress={() => setEditing("new")} />
          <Button
            title={live.status === "fail" ? "Confirmar mesmo assim…" : "Confirmar fatura"}
            variant={live.status === "fail" ? "danger" : "primary"}
            onPress={confirm}
            loading={busy}
          />
        </View>
      ) : null}
      <Button title="Descartar esta fatura" variant="ghost" onPress={discard} />

      {threads.sheet}
      <CategorySheet
        visible={sheetFor !== null}
        title={sheetFor?.description_clean ?? ""}
        subtitle={sheetFor ? `${formatBRL(sheetFor.amountCents)}` : undefined}
        allowPrivate
        onClose={() => setSheetFor(null)}
        onChoose={(c) => sheetFor && void choose(sheetFor)(c)}
      />
      <EditModal
        target={editing}
        t={t}
        onClose={() => setEditing(null)}
        onSave={(patch) =>
          run(async () => {
            if (editing === "new") {
              await insertManual(statement, patch);
            } else if (editing) {
              await supabase.from("transactions").update({ amount_cents: patch.amountCents }).eq("id", editing.id).throwOnError();
            }
            await syncReconciliation(statement.id);
            setEditing(null);
          })
        }
        onDelete={() =>
          run(async () => {
            if (editing && editing !== "new") await supabase.from("transactions").delete().eq("id", editing.id).throwOnError();
            await syncReconciliation(statement.id);
            setEditing(null);
          })
        }
      />
    </Screen>
  );
}

async function syncReconciliation(statementId: string) {
  const [st, tx] = await Promise.all([
    supabase.from("statements").select(STATEMENT_COLUMNS).eq("id", statementId).single().throwOnError(),
    supabase.from("transactions").select(TX_FULL_COLUMNS).eq("statement_id", statementId).throwOnError(),
  ]);
  await refreshReconciliation(st.data as unknown as StatementRow, (tx.data ?? []).map((r) => toTxFull(r as Record<string, unknown>)));
}

async function insertManual(statement: StatementRow, patch: { amountCents: number; description?: string; date?: string }) {
  const { data: household } = await supabase.from("accounts").select("household_id").eq("id", statement.account_id).single().throwOnError();
  const description = (patch.description ?? "Lançamento manual").trim();
  await supabase
    .from("transactions")
    .insert({
      household_id: household!.household_id,
      account_id: statement.account_id,
      statement_id: statement.id,
      posted_on: patch.date ?? statement.closing_date,
      description_raw: description.toUpperCase(),
      description_clean: description,
      amount_cents: patch.amountCents,
      kind: patch.amountCents < 0 ? "estorno" : "avista",
      section: "despesas",
      category_id: 12,
      category_source: "none",
      confidence: "baixa",
      needs_review: true,
      source: "manual",
      dedupe_hash: sha256Hex(`manual|${randomUUID()}`),
    })
    .throwOnError();
}

function Line({ label, cents, bold }: { label: string; cents: number; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
      <Body muted style={{ flex: 1 }}>{label}</Body>
      <Money cents={cents} bold={bold} />
    </View>
  );
}

function CheckRow({ check }: { check: ReconcileCheck }) {
  const tone = check.status === "ok" ? "good" : check.status === "rounding" ? "warn" : "bad";
  return (
    <View style={{ gap: 2, paddingTop: space.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
        <Body style={{ flex: 1, fontSize: 14 }}>{check.label}</Body>
        <Badge label={check.status === "ok" ? "bate" : check.status === "rounding" ? `≈ ${formatBRL(check.diffCents)}` : `${check.diffCents > 0 ? "+" : ""}${formatBRL(check.diffCents)}`} tone={tone} />
      </View>
      {check.status !== "ok" ? <Small>Banco: {formatBRL(check.expectedCents)} · Lançamentos: {formatBRL(check.actualCents)}</Small> : null}
      {check.note ? <Small>{check.note}</Small> : null}
    </View>
  );
}

function EditModal({ target, t, onClose, onSave, onDelete }: {
  target: TxFull | "new" | null; t: ReturnType<typeof useTheme>; onClose: () => void;
  onSave: (patch: { amountCents: number; description?: string; date?: string }) => void; onDelete: () => void;
}) {
  const isNew = target === "new";
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastTarget, setLastTarget] = useState<typeof target>(null);
  if (target !== lastTarget) {
    setLastTarget(target);
    setError(null);
    setAmount(target && target !== "new" ? formatBRL(target.amountCents).replace("R$ ", "") : "");
    setDescription("");
    setDate("");
  }
  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 12, fontSize: 16, color: t.text, backgroundColor: t.surface } as const;

  function save() {
    const cents = tryParseBRL(amount);
    if (cents === null) return setError("Valor inválido. Use o formato 12,34.");
    let iso: string | undefined;
    if (isNew) {
      if (!description.trim()) return setError("Descreva o lançamento.");
      try { iso = date.trim() ? parseBrDate(date) : undefined; } catch { return setError("Data inválida. Use dd/mm/aaaa."); }
    }
    onSave({ amountCents: cents, description: description.trim(), date: iso });
  }

  return (
    <Modal visible={target !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: t.surface, padding: space.lg, gap: space.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
          <SectionTitle>{isNew ? "Adicionar lançamento" : "Editar lançamento"}</SectionTitle>
          {!isNew && target ? <Small>{target.description_clean}</Small> : null}
          {isNew ? (
            <>
              <TextInput style={input} placeholder="Descrição" placeholderTextColor={t.textMuted} value={description} onChangeText={setDescription} accessibilityLabel="Descrição" />
              <TextInput style={input} placeholder="Data (dd/mm/aaaa) — vazio = fechamento" placeholderTextColor={t.textMuted} value={date} onChangeText={setDate} accessibilityLabel="Data" />
            </>
          ) : null}
          <TextInput style={input} placeholder="Valor (ex.: 123,45)" placeholderTextColor={t.textMuted} keyboardType="numbers-and-punctuation" value={amount} onChangeText={setAmount} accessibilityLabel="Valor em reais" />
          {error ? <ErrorText message={error} /> : null}
          <Button title="Salvar" onPress={save} />
          {!isNew ? <Button title="Excluir lançamento" variant="danger" onPress={onDelete} /> : null}
          <Button title="Cancelar" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
