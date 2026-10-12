import { useState } from "react";
import { Alert, View } from "react-native";
import { formatMonthLong } from "@financas/core";
import { CategorySheet, type CategoryChoice } from "@/components/CategorySheet";
import { TxItem } from "@/components/TxItem";
import { Body, Button, Card, Empty, ErrorText, H1, Loading, Money, Screen, SectionTitle } from "@/components/ui";
import { useLoad, type TxRow } from "@/lib/data";
import { deleteManualEntry, fetchManualEntries } from "@/lib/manual";
import { applyCategory, setPrivate } from "@/lib/mutations";
import { useReady } from "@/lib/session";
import { useRouter } from "expo-router";

export default function Lancamentos() {
  const router = useRouter();
  const { me, partner } = useReady();
  const { data, error, loading, reload } = useLoad(fetchManualEntries);
  const [sheetFor, setSheetFor] = useState<TxRow | null>(null);
  const [fail, setFail] = useState<string | null>(null);

  const ownerLabel = (uid: string | null) => (uid === null ? null : uid === me.user_id ? "meu" : partner?.display_name ?? "par");
  const run = async (fn: () => Promise<void>) => {
    setFail(null);
    try { await fn(); await reload(); } catch (e) { setFail((e as Error).message); }
  };
  const choose = (tx: TxRow) => (c: CategoryChoice) =>
    run(async () => {
      setSheetFor(null);
      await applyCategory({ description: tx.descriptionRaw, txId: tx.id, categoryId: c.categoryId, ownerUserId: c.ownerUserId, always: c.always });
      if (c.isPrivate) await setPrivate([tx.id], me.user_id, true);
    });

  const byMonth = new Map<string, TxRow[]>();
  for (const t of data ?? []) (byMonth.get(t.statementMonth) ?? byMonth.set(t.statementMonth, []).get(t.statementMonth)!).push(t);

  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <H1>Pix e dinheiro</H1>
      <Button title="Lançar gasto" onPress={() => router.push("/lancar")} />
      {error || fail ? <ErrorText message={(error ?? fail)!} /> : null}
      {data && data.length === 0 ? <Empty title="Nenhum lançamento manual" hint="Use “Lançar gasto” para Pix, dinheiro, débito ou boleto." /> : null}
      {[...byMonth.entries()].map(([month, items]) => (
        <Card key={month} style={{ gap: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingBottom: 8 }}>
            <SectionTitle>{formatMonthLong(month)}</SectionTitle>
            <Money cents={items.reduce((a, x) => a + x.amountCents, 0)} bold />
          </View>
          {items.map((x) => (
            <TxItem
              key={x.id}
              tx={{ id: x.id, postedOn: x.postedOn, descriptionClean: x.descriptionClean, amountCents: x.amountCents, amountUsdCents: null, categoryId: x.categoryId, installmentN: null, installmentTotal: null, needsReview: x.needsReview, ownerLabel: ownerLabel(x.ownerUserId), isPrivate: x.isPrivate }}
              onPress={() => setSheetFor(x)}
              onMore={() => Alert.alert(x.descriptionClean, "O que fazer com este lançamento?", [{ text: "Cancelar", style: "cancel" }, { text: "Excluir", style: "destructive", onPress: () => void run(() => deleteManualEntry(x.id)) }])}
            />
          ))}
        </Card>
      ))}
      <Body muted style={{ fontSize: 13 }}>Toque para mudar a categoria; “⋯” para excluir.</Body>
      <CategorySheet visible={sheetFor !== null} title={sheetFor?.descriptionClean ?? ""} allowPrivate onClose={() => setSheetFor(null)} onChoose={(c) => sheetFor && void choose(sheetFor)(c)} />
    </Screen>
  );
}
