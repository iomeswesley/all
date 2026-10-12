import { useMemo, useState } from "react";
import { View } from "react-native";
import { categoryName, decodeDescription, formatBrDayMonth, merchantKey, CAT } from "@financas/core";
import { CategorySheet, type CategoryChoice } from "@/components/CategorySheet";
import { Body, Card, Chip, Empty, ErrorText, H1, Loading, Money, Screen, Small } from "@/components/ui";
import { fetchAll, useLoad } from "@/lib/data";
import { applyCategory, applyToIds, setPrivate } from "@/lib/mutations";
import { useReady } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { categoryColor, space, useTheme } from "@/lib/theme";
import { formatBRL } from "@/lib/format";

interface Pending { id: string; description_raw: string; description_clean: string; amount_cents: number; posted_on: string; category_id: number | null }
interface Group { key: string; label: string; items: Pending[]; totalCents: number }

async function load() {
  const [pending, used] = await Promise.all([
    fetchAll<Pending>((from, to) =>
      supabase.from("transactions").select("id, description_raw, description_clean, amount_cents, posted_on, category_id").eq("needs_review", true).neq("kind", "pagamento").order("posted_on", { ascending: false }).range(from, to) as unknown as PromiseLike<{ data: Pending[] | null; error: { message: string } | null }>,
    ),
    // categorias mais usadas, para sugerir 1 toque
    supabase.from("transactions").select("category_id").eq("needs_review", false).not("category_id", "is", null).limit(1000),
  ]);
  const freq = new Map<number, number>();
  for (const r of used.data ?? []) {
    const id = r.category_id as number;
    if (id !== CAT.OUTROS) freq.set(id, (freq.get(id) ?? 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
  return { pending, top };
}

export default function Revisar() {
  const t = useTheme();
  const { me } = useReady();
  const { data, error, loading, reload } = useLoad(load);
  const [sheet, setSheet] = useState<Group | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const p of data?.pending ?? []) {
      const key = merchantKey(p.description_raw);
      const g = map.get(key) ?? { key, label: decodeDescription(p.description_raw).display, items: [], totalCents: 0 };
      g.items.push(p);
      g.totalCents += Number(p.amount_cents);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
  }, [data]);

  async function apply(g: Group, c: CategoryChoice) {
    setBusy(true);
    setFail(null);
    setSheet(null);
    try {
      if (c.always) await applyCategory({ description: g.items[0]!.description_raw, txId: g.items[0]!.id, categoryId: c.categoryId, ownerUserId: c.ownerUserId, always: true });
      else await applyToIds(g.items.map((i) => i.id), c.categoryId, c.ownerUserId);
      if (c.isPrivate) await setPrivate(g.items.map((i) => i.id), me.user_id, true);
      await reload();
    } catch (e) {
      setFail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const total = groups.reduce((a, g) => a + g.items.length, 0);
  return (
    <Screen onRefresh={reload} refreshing={loading || busy}>
      <H1>Revisar</H1>
      <Body muted>Toque numa categoria: vale para todos os lançamentos desse estabelecimento e para os próximos, para os dois.</Body>
      {loading && !data ? <Loading /> : null}
      {error || fail ? <ErrorText message={(error ?? fail)!} /> : null}
      {data && groups.length === 0 ? <Empty title="Tudo revisado 🎉" hint="Quando uma fatura nova trouxer estabelecimentos desconhecidos, eles aparecem aqui." /> : null}
      {total > 0 ? <Small>{total} lançamentos em {groups.length} estabelecimentos</Small> : null}

      {groups.map((g) => (
        <Card key={g.key} style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: "600" }} numberOfLines={2}>{g.label}</Body>
              <Small>{g.items.length === 1 ? `1 lançamento · ${formatBrDayMonth(g.items[0]!.posted_on)}` : `${g.items.length} lançamentos`}</Small>
            </View>
            <Money cents={g.totalCents} bold />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {(data?.top ?? []).map((id) => (
              <Chip key={id} label={categoryName(id)} color={categoryColor(t, id)} onPress={() => void apply(g, { categoryId: id, ownerUserId: undefined, always: true })} />
            ))}
            <Chip label="Outra…" onPress={() => setSheet(g)} />
          </View>
        </Card>
      ))}

      <CategorySheet
        visible={sheet !== null}
        title={sheet?.label ?? ""}
        subtitle={sheet ? formatBRL(sheet.totalCents) : undefined}
        matchCount={sheet?.items.length}
        allowPrivate
        onClose={() => setSheet(null)}
        onChoose={(c) => sheet && void apply(sheet, c)}
      />
    </Screen>
  );
}

