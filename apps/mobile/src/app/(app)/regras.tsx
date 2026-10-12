import { useMemo, useState } from "react";
import { Alert, Modal, ScrollView, Switch, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CATEGORIES, MATCH_TYPE_LABEL, categoryName, validateRulePattern, type MatchType } from "@financas/core";
import { Badge, Body, Button, Card, Chip, Empty, ErrorText, H1, Loading, Screen, SectionTitle, Small } from "@/components/ui";
import { useLoad } from "@/lib/data";
import { applyRuleToExisting, countRuleMatches, deleteRule, fetchRules, fetchTxLite, updateRule, type RuleRow } from "@/lib/rules";
import { useReady } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { categoryColor, radius, space, useTheme } from "@/lib/theme";

interface Draft {
  id: string | null;
  pattern: string;
  matchType: MatchType;
  categoryId: number | null;
  ownerUserId: string | null;
}

const MATCH_TYPES: MatchType[] = ["contains", "prefix", "regex"];

/** Regras do casal: ver, corrigir e apagar o que foi aprendido nas correções. */
export default function Regras() {
  const t = useTheme();
  const { householdId, me, partner, user } = useReady();
  const { data, error, loading, reload } = useLoad(async () => {
    const [rules, txs] = await Promise.all([fetchRules(), fetchTxLite()]);
    return { rules, txs };
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [applyExisting, setApplyExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const matches = useMemo(() => (draft && data ? countRuleMatches(data.txs, { pattern: draft.pattern, matchType: draft.matchType }) : 0), [draft, data]);
  const patternProblem = draft ? validateRulePattern(draft.pattern, draft.matchType) : null;
  const ownerName = (id: string | null) => (id === null ? null : id === me.user_id ? "meu" : partner?.display_name ?? "par");
  const input = { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 12, fontSize: 16, color: t.text, backgroundColor: t.surface } as const;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setFail(null);
    try { await fn(); await reload(); } catch (e) { setFail((e as Error).message); } finally { setBusy(false); }
  }

  const save = () =>
    run(async () => {
      if (!draft || patternProblem) return;
      if (draft.categoryId === null && draft.ownerUserId === null) throw new Error("Escolha uma categoria ou um dono.");
      if (draft.id) await updateRule(draft.id, draft);
      else {
        const { error } = await supabase.from("rules").insert({ household_id: householdId, pattern: draft.pattern.trim(), match_type: draft.matchType, category_id: draft.categoryId, owner_user_id: draft.ownerUserId, created_by: user.id });
        if (error) throw new Error(error.message.includes("duplicate") ? "Já existe uma regra igual." : error.message);
      }
      const changed = applyExisting ? await applyRuleToExisting(draft) : 0;
      setNote(applyExisting ? `Regra salva. ${changed} lançamento${changed === 1 ? "" : "s"} atualizado${changed === 1 ? "" : "s"}.` : "Regra salva (vale para os próximos).");
      setDraft(null);
    });

  function remove(rule: RuleRow) {
    Alert.alert("Apagar esta regra?", `“${rule.pattern}” deixa de valer para os próximos lançamentos.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Só apagar a regra", onPress: () => void run(async () => { await deleteRule(rule, { recategorize: false }); setNote("Regra apagada. Os lançamentos já classificados continuam como estão."); setDraft(null); }) },
      { text: "Apagar e reclassificar", style: "destructive", onPress: () => void run(async () => { const n = await deleteRule(rule, { recategorize: true }); setNote(`Regra apagada. ${n} lançamento${n === 1 ? "" : "s"} reclassificado${n === 1 ? "" : "s"} (correções manuais não são tocadas).`); setDraft(null); }) },
    ]);
  }

  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={reload} refreshing={loading || busy}>
      <H1>Regras</H1>
      <Body muted>Cada correção que você faz vira uma regra para o casal. Aqui você confere, ajusta ou apaga.</Body>
      <Button title="Nova regra" onPress={() => { setApplyExisting(true); setDraft({ id: null, pattern: "", matchType: "contains", categoryId: null, ownerUserId: null }); }} />
      {error || fail ? <ErrorText message={(error ?? fail)!} /> : null}
      {note ? <Small>{note}</Small> : null}
      {data && data.rules.length === 0 ? <Empty title="Nenhuma regra ainda" hint="Elas aparecem quando você categoriza um estabelecimento em Revisar." /> : null}

      {(data?.rules ?? []).map((r) => (
        <Card key={r.id} style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: "700" }} numberOfLines={2}>{r.pattern}</Body>
              <Small>{MATCH_TYPE_LABEL[r.matchType]} · casa {countRuleMatches(data!.txs, r)} lançamento{countRuleMatches(data!.txs, r) === 1 ? "" : "s"}</Small>
            </View>
            <Button title="Editar" small variant="secondary" onPress={() => { setApplyExisting(false); setDraft({ id: r.id, pattern: r.pattern, matchType: r.matchType, categoryId: r.categoryId, ownerUserId: r.ownerUserId }); }} />
          </View>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {r.categoryId ? <Badge label={categoryName(r.categoryId)} /> : null}
            {ownerName(r.ownerUserId) ? <Badge label={`dono: ${ownerName(r.ownerUserId)}`} /> : null}
          </View>
        </Card>
      ))}

      <Modal visible={draft !== null} animationType="slide" transparent onRequestClose={() => setDraft(null)}>
        <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <SafeAreaView edges={["bottom"]} style={{ backgroundColor: t.surface, maxHeight: "92%" }}>
            <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
              {draft ? (
                <>
                  <SectionTitle>{draft.id ? "Editar regra" : "Nova regra"}</SectionTitle>
                  <TextInput style={input} placeholder="Trecho do nome (ex.: DIVINA GULA)" placeholderTextColor={t.textMuted} autoCapitalize="characters" value={draft.pattern} onChangeText={(pattern) => setDraft({ ...draft, pattern })} accessibilityLabel="Padrão" />
                  <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                    {MATCH_TYPES.map((m) => <Chip key={m} label={MATCH_TYPE_LABEL[m]} selected={draft.matchType === m} onPress={() => setDraft({ ...draft, matchType: m })} />)}
                  </View>
                  {patternProblem ? <ErrorText message={patternProblem} /> : <Small>Casa {matches} lançamento{matches === 1 ? "" : "s"} já importados.</Small>}

                  <Small>Categoria</Small>
                  <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                    <Chip label="Não definir" selected={draft.categoryId === null} onPress={() => setDraft({ ...draft, categoryId: null })} />
                    {CATEGORIES.map((c) => <Chip key={c.id} label={c.name} color={categoryColor(t, c.id)} selected={draft.categoryId === c.id} onPress={() => setDraft({ ...draft, categoryId: c.id })} />)}
                  </View>
                  <Small>Dono</Small>
                  <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                    <Chip label="Não definir" selected={draft.ownerUserId === null} onPress={() => setDraft({ ...draft, ownerUserId: null })} />
                    <Chip label="Meu" selected={draft.ownerUserId === me.user_id} onPress={() => setDraft({ ...draft, ownerUserId: me.user_id })} />
                    {partner ? <Chip label={partner.display_name} selected={draft.ownerUserId === partner.user_id} onPress={() => setDraft({ ...draft, ownerUserId: partner.user_id })} /> : null}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
                    <View style={{ flex: 1 }}>
                      <Body>Aplicar aos já importados</Body>
                      <Small>Atualiza categoria e dono dos {matches} lançamentos que a regra casa.</Small>
                    </View>
                    <Switch value={applyExisting} onValueChange={setApplyExisting} accessibilityLabel="Aplicar aos lançamentos já importados" />
                  </View>
                  <Button title="Salvar regra" onPress={save} loading={busy} disabled={!!patternProblem} />
                  {draft.id ? <Button title="Apagar regra" variant="danger" onPress={() => remove(data!.rules.find((r) => r.id === draft.id)!)} /> : null}
                  <Button title="Cancelar" variant="ghost" onPress={() => setDraft(null)} />
                </>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </Screen>
  );
}
