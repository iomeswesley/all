import * as Linking from "expo-linking";
import { useMemo, useState } from "react";
import { Alert, Modal, Share, TextInput, View } from "react-native";
import {
  EDUCATION_LIMIT_CENTS_DEFAULT, effectiveDate, suggestTaxKind, taxCandidates, taxCsv, taxReport, formatBrDate, tryParseBRL, type TaxKind, type TaxTx,
} from "@financas/core";
import { formatBRL, formatNumberBR } from "@/lib/format";
import { Badge, Banner, Body, Button, Card, Chip, ErrorText, H1, Loading, Money, Row, Screen, SectionTitle, Small } from "@/components/ui";
import { useAnalysis } from "@/lib/analysis";
import { useLoad } from "@/lib/data";
import { attachReceipt, fetchSettings, pickReceipt, receiptUrl, removeReceipt, saveSettings, updateTax } from "@/lib/phase3";
import { useReady } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

const KIND_LABEL: Record<TaxKind, string> = { saude: "Saúde", educacao: "Educação", outros: "Outros" };

export default function ImpostoDeRenda() {
  const { householdId, me, partner } = useReady();
  const analysis = useAnalysis();
  const settings = useLoad(fetchSettings);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState<number | null>(null);
  const [owner, setOwner] = useState<"all" | string>("all");
  const [editing, setEditing] = useState<TaxTx | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const t = useTheme();
  const [limitText, setLimitText] = useState<string | null>(null);

  const txs = useMemo<TaxTx[]>(
    () =>
      (analysis.data?.txs ?? [])
        .filter((t) => !t.hiddenAggregate && t.kind !== "pagamento")
        .map((t) => ({
          id: t.id, postedOn: effectiveDate(t), descriptionClean: t.descriptionClean, descriptionRaw: t.descriptionRaw, amountCents: t.amountCents,
          categoryId: t.categoryId, taxDeductible: t.taxDeductible, taxKind: t.taxKind, attachmentPath: t.attachmentPath, ownerUserId: t.ownerUserId,
        })),
    [analysis.data],
  );
  const years = useMemo(() => [...new Set(txs.map((t) => Number(t.postedOn.slice(0, 4))))].sort((a, b) => b - a), [txs]);
  const y = year ?? years[0] ?? thisYear;
  const limit = settings.data?.educationLimitCents;
  const report = useMemo(() => taxReport(txs, y, { educationLimitCents: limit, ownerUserId: owner }), [txs, y, limit, owner]);
  const candidates = useMemo(() => taxCandidates(txs, y).filter((t) => owner === "all" || t.ownerUserId === owner).sort((a, b) => b.amountCents - a.amountCents).slice(0, 15), [txs, y, owner]);
  const nameOf = (id: string | null) => (id === null ? "Nosso" : id === me.user_id ? me.display_name : partner?.display_name ?? "Par");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try { await fn(); await analysis.reload(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  if (analysis.loading && !analysis.data) return <Screen><Loading /></Screen>;
  const editingTx = editing ? txs.find((t) => t.id === editing.id) ?? editing : null;

  return (
    <Screen onRefresh={() => void analysis.reload()} refreshing={analysis.loading || busy}>
      <H1>Imposto de renda</H1>
      <Body muted>Despesas de saúde e educação para a declaração. Marque, anexe a nota e exporte. Quem decide o que declarar é você; confira as regras da Receita.</Body>
      {analysis.error || msg ? <ErrorText message={(analysis.error ?? msg)!} /> : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {(years.length ? years : [thisYear]).map((yy) => <Chip key={yy} label={String(yy)} selected={y === yy} onPress={() => setYear(yy)} />)}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Chip label="Todos" selected={owner === "all"} onPress={() => setOwner("all")} />
        <Chip label={me.display_name} selected={owner === me.user_id} onPress={() => setOwner(me.user_id)} />
        {partner ? <Chip label={partner.display_name} selected={owner === partner.user_id} onPress={() => setOwner(partner.user_id)} /> : null}
      </View>

      <Card>
        <SectionTitle>Limite de educação</SectionTitle>
        <Small>Limite anual de dedução com instrução, por pessoa. Confirme o valor vigente no programa da Receita e ajuste aqui quando mudar.</Small>
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
          <TextInput
            style={{ flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 12, fontSize: 16, color: t.text, backgroundColor: t.surface }}
            keyboardType="numbers-and-punctuation"
            placeholder="3.561,50"
            placeholderTextColor={t.textMuted}
            value={limitText ?? formatNumberBR(settings.data?.educationLimitCents ?? EDUCATION_LIMIT_CENTS_DEFAULT)}
            onChangeText={setLimitText}
            accessibilityLabel="Limite anual de educação em reais"
          />
          <Button
            title="Salvar"
            small
            variant="secondary"
            disabled={limitText === null}
            onPress={() => {
              const cents = tryParseBRL(limitText ?? "");
              if (cents === null || cents < 0) return setMsg("Valor inválido. Use o formato 3.561,50.");
              void run(async () => { await saveSettings(householdId, { educationLimitCents: cents }); await settings.reload(); setLimitText(null); setMsg("Limite salvo."); });
            }}
          />
        </View>
      </Card>

      <Card>
        <Small>Total dedutível em {y}</Small>
        <Money cents={report.totalDeductibleCents} bold style={{ fontSize: 30 }} />
        {report.sections.some((s) => s.kind === "educacao" && s.deductibleCents < s.totalCents) ? (
          <Small>Educação limitada a {formatBRL(report.educationLimitCents)} por pessoa; o excedente não entra.</Small>
        ) : null}
        {report.missingReceipts > 0 ? <Banner tone="warn" title={`${report.missingReceipts} sem comprovante`}><Small>Anexe a nota fiscal ou recibo para ter como comprovar.</Small></Banner> : report.sections.length > 0 ? <Banner tone="good" title="Todos com comprovante" /> : null}
        <Button title="Exportar CSV do ano" variant="secondary" disabled={report.sections.length === 0} onPress={() => void Share.share({ title: `IR ${y}`, message: taxCsv(report, nameOf) })} />
      </Card>

      {report.sections.map((s) => (
        <Card key={s.kind} style={{ gap: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: space.sm }}>
            <SectionTitle>{KIND_LABEL[s.kind]} ({s.items.length})</SectionTitle>
            <Money cents={s.totalCents} bold />
          </View>
          {s.items.map((t, i) => (
            <Row key={t.id} last={i === s.items.length - 1} onPress={() => setEditing(t)}>
              <View style={{ flex: 1 }}>
                <Body numberOfLines={1} style={{ fontWeight: "500" }}>{t.descriptionClean}</Body>
                <Small>{formatBrDate(t.postedOn)} · {nameOf(t.ownerUserId)}</Small>
              </View>
              <Badge label={t.attachmentPath ? "📎 nota" : "sem nota"} tone={t.attachmentPath ? "good" : "warn"} />
              <Money cents={t.amountCents} />
            </Row>
          ))}
        </Card>
      ))}

      {candidates.length > 0 ? (
        <Card style={{ gap: 0 }}>
          <SectionTitle>Possíveis despesas dedutíveis</SectionTitle>
          <Small>Sugeridas pela categoria. Medicamentos e academia não são dedutíveis e ficam de fora.</Small>
          {candidates.map((t, i) => (
            <Row key={t.id} last={i === candidates.length - 1} onPress={() => setEditing(t)}>
              <View style={{ flex: 1 }}>
                <Body numberOfLines={1}>{t.descriptionClean}</Body>
                <Small>{formatBrDate(t.postedOn)} · {KIND_LABEL[suggestTaxKind(t.categoryId, t.descriptionRaw ?? t.descriptionClean).kind ?? "outros"]}</Small>
              </View>
              <Money cents={t.amountCents} />
            </Row>
          ))}
        </Card>
      ) : null}

      <Modal visible={editingTx !== null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          {editingTx ? (
            <Card style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: space.md }}>
              <SectionTitle>{editingTx.descriptionClean}</SectionTitle>
              <Small>{formatBrDate(editingTx.postedOn)} · {formatBRL(editingTx.amountCents)}</Small>
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                <Chip label="Dedutível" selected={editingTx.taxDeductible} onPress={() => void run(() => updateTax(editingTx.id, { taxDeductible: !editingTx.taxDeductible, taxKind: editingTx.taxKind ?? suggestTaxKind(editingTx.categoryId, editingTx.descriptionRaw ?? editingTx.descriptionClean).kind ?? "outros" }))} />
              </View>
              {editingTx.taxDeductible ? (
                <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                  {(["saude", "educacao", "outros"] as TaxKind[]).map((k) => (
                    <Chip key={k} label={KIND_LABEL[k]} selected={(editingTx.taxKind ?? "outros") === k} onPress={() => void run(() => updateTax(editingTx.id, { taxKind: k }))} />
                  ))}
                </View>
              ) : null}
              <Body style={{ fontWeight: "600" }}>Nota fiscal / recibo</Body>
              {editingTx.attachmentPath ? (
                <View style={{ gap: space.sm }}>
                  <Button title="Ver comprovante" variant="secondary" onPress={() => void run(async () => { await Linking.openURL(await receiptUrl(editingTx.attachmentPath!)); })} />
                  <Button title="Remover comprovante" variant="ghost" onPress={() => Alert.alert("Remover o comprovante?", undefined, [{ text: "Cancelar", style: "cancel" }, { text: "Remover", style: "destructive", onPress: () => void run(() => removeReceipt(editingTx.id, editingTx.attachmentPath!)) }])} />
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <View style={{ flex: 1 }}><Button title="Fotografar" variant="secondary" onPress={() => void run(async () => { const a = await pickReceipt("camera"); if (a) await attachReceipt(householdId, editingTx.id, a); })} /></View>
                  <View style={{ flex: 1 }}><Button title="Da galeria" variant="secondary" onPress={() => void run(async () => { const a = await pickReceipt("library"); if (a) await attachReceipt(householdId, editingTx.id, a); })} /></View>
                </View>
              )}
              <Small>Anexar a nota já marca o lançamento como dedutível. O arquivo fica num espaço privado do casal.</Small>
              <Button title="Fechar" variant="ghost" onPress={() => setEditing(null)} />
            </Card>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}
