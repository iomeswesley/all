import { useState } from "react";
import { Modal, Pressable, ScrollView, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CATEGORIES } from "@financas/core";
import { categoryColor, space, useTheme } from "@/lib/theme";
import { useSession } from "@/lib/session";
import { Body, Chip, Small } from "./ui";

export interface CategoryChoice {
  categoryId: number;
  /** user id do dono; null = "nosso"; undefined = não alterar */
  ownerUserId: string | null | undefined;
  /** criar regra para todos os lançamentos parecidos, para os dois */
  always: boolean;
  /** gasto pessoal: só o dono vê os itens (undefined = não alterar) */
  isPrivate?: boolean;
}

/**
 * Folha de correção: toque na categoria e pronto (2 toques no total: abrir → categoria).
 * "Sempre" vem ligado: a correção vira regra para o casal inteiro.
 */
export function CategorySheet({ visible, title, subtitle, matchCount, allowPrivate, onClose, onChoose }: {
  visible: boolean; title: string; subtitle?: string; matchCount?: number; allowPrivate?: boolean; onClose: () => void; onChoose: (c: CategoryChoice) => void;
}) {
  const t = useTheme();
  const { state } = useSession();
  const [always, setAlways] = useState(true);
  const [owner, setOwner] = useState<string | null | undefined>(undefined);
  const [isPrivate, setIsPrivate] = useState(false);
  const ready = state.status === "ready" ? state : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Fechar" style={{ flex: 1, backgroundColor: "#0008" }} onPress={onClose} />
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: t.surface, maxHeight: "80%" }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
          <Body style={{ fontWeight: "700", fontSize: 18 }} numberOfLines={2}>{title}</Body>
          {subtitle ? <Small>{subtitle}</Small> : null}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Body>Sempre que aparecer</Body>
              <Small>{matchCount && matchCount > 1 ? `Aplica a ${matchCount} lançamentos e aos próximos, para os dois.` : "Vale para os próximos, para os dois."}</Small>
            </View>
            <Switch value={always} onValueChange={setAlways} accessibilityLabel="Sempre que aparecer" />
          </View>

          {ready && ready.partner ? (
            <View style={{ gap: 6 }}>
              <Small>De quem é?</Small>
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                <Chip label="Manter" selected={owner === undefined} onPress={() => setOwner(undefined)} />
                <Chip label="Nosso" selected={owner === null} onPress={() => setOwner(null)} />
                <Chip label="Meu" selected={owner === ready.me.user_id} onPress={() => setOwner(ready.me.user_id)} />
                <Chip label={ready.partner.display_name} selected={owner === ready.partner.user_id} onPress={() => setOwner(ready.partner!.user_id)} />
              </View>
            </View>
          ) : null}

          {allowPrivate && ready?.partner ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Body>Gasto pessoal 🔒</Body>
                <Small>Só eu vejo este item. {ready.partner.display_name} vê apenas o total da categoria.</Small>
              </View>
              <Switch value={isPrivate} onValueChange={setIsPrivate} accessibilityLabel="Gasto pessoal" />
            </View>
          ) : null}

          <Small>Categoria</Small>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {CATEGORIES.map((c) => (
              <Chip key={c.id} label={c.name} color={categoryColor(t, c.id)} onPress={() => onChoose({ categoryId: c.id, ownerUserId: owner, always, isPrivate: allowPrivate && isPrivate ? true : undefined })} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
