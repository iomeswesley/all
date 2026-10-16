import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatBRL } from "@/lib/format";

import { radius, space, useTheme } from "@/lib/theme";

export function Screen({ children, onRefresh, refreshing = false, scroll = true, padded = true }: {
  children: ReactNode; onRefresh?: () => void; refreshing?: boolean; scroll?: boolean; padded?: boolean;
}) {
  const t = useTheme();
  const body = padded ? { padding: space.lg, gap: space.lg, paddingBottom: space.xl * 2 } : undefined;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={body}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} /> : undefined}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, body]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, padding: space.lg, gap: space.md,
          shadowColor: "#000", shadowOpacity: t.dark ? 0 : 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: t.dark ? 0 : 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: "800", letterSpacing: -0.6, color: t.text }}>{children}</Text>;
}

/** Cabeçalho de tela: título grande + ações à direita. */
export function Header({ title, kicker, right }: { title: string; kicker?: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md }}>
      <View style={{ flex: 1 }}>
        {kicker ? <Text style={{ color: t.textMuted, fontSize: 13, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>{kicker}</Text> : null}
        <H1>{title}</H1>
      </View>
      {right ? <View style={{ flexDirection: "row", gap: space.sm }}>{right}</View> : null}
    </View>
  );
}

/** Botão redondo só com ícone (ações do cabeçalho). */
export function IconButton({ icon, label, onPress, filled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; filled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => ({
        width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
        backgroundColor: filled ? t.primaryFill : t.surface, borderWidth: filled ? 0 : StyleSheet.hairlineWidth, borderColor: t.border, opacity: pressed ? 0.75 : 1,
      })}
    >
      <Ionicons name={icon} size={22} color={filled ? t.onPrimary : t.text} />
    </Pressable>
  );
}

/** Cartão de destaque em degradê: rótulo, valor grande e linha de apoio. */
export function Hero({ label, value, children, top }: { label: string; value: string; children?: ReactNode; top?: ReactNode }) {
  const t = useTheme();
  return (
    <LinearGradient colors={[t.heroFrom, t.heroTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: space.xl, gap: space.sm }}>
      {top}
      <Text style={{ color: t.onHeroMuted, fontSize: 14, fontWeight: "600" }}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: t.onPrimary, fontSize: 40, fontWeight: "800", letterSpacing: -1, fontVariant: ["tabular-nums"] }}>{value}</Text>
      {children}
    </LinearGradient>
  );
}

/** Pílula translúcida para usar dentro do Hero. */
export function HeroPill({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ color: t.onPrimary, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{children}</Text>
    </View>
  );
}

/** Número pequeno com rótulo (linha de indicadores). */
export function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const t = useTheme();
  const c = tone === "good" ? t.success : tone === "bad" ? t.danger : tone === "warn" ? t.warning : t.text;
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: t.textMuted, fontSize: 12.5, fontWeight: "500" }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: c, fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

/** Controle segmentado (2–4 opções). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => { void Haptics.selectionAsync(); onChange(o.value); }}
            style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md - 3, backgroundColor: on ? t.surface : "transparent" }}
          >
            <Text style={{ color: on ? t.text : t.textSecondary, fontWeight: on ? "700" : "500", fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "700", letterSpacing: -0.2, color: t.text }}>{children}</Text>
      {right}
    </View>
  );
}

export function Body({ children, muted, style, numberOfLines }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ fontSize: 15, color: muted ? t.textSecondary : t.text }, style]}>{children}</Text>;
}

export function Small({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[{ fontSize: 12.5, color: t.textMuted }, style]}>{children}</Text>;
}

export function Money({ cents, style, bold, signed, color }: { cents: number; style?: StyleProp<TextStyle>; bold?: boolean; signed?: boolean; color?: string }) {
  const t = useTheme();
  const text = signed && cents > 0 ? `+${formatBRL(cents)}` : formatBRL(cents);
  return <Text style={[{ fontSize: 15, color: color ?? t.text, fontWeight: bold ? "700" : "400", fontVariant: ["tabular-nums"] }, style]}>{text}</Text>;
}

export function Button({ title, onPress, variant = "primary", loading, disabled, small }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean; disabled?: boolean; small?: boolean;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.primaryFill : variant === "danger" ? t.dangerFill : "transparent";
  const fg = variant === "primary" || variant === "danger" ? t.onPrimary : variant === "ghost" ? t.primary : t.text;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderWidth: variant === "secondary" ? 1 : 0,
        borderColor: t.border,
        borderRadius: radius.md,
        paddingVertical: small ? 8 : 14,
        paddingHorizontal: small ? 12 : 18,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        opacity: off ? 0.5 : pressed ? 0.8 : 1,
        minHeight: small ? 44 : 48,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : null}
      <Text style={{ color: fg, fontSize: small ? 14 : 16, fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", gap: 6,
        paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, minHeight: 44,
        backgroundColor: selected ? t.primaryFill : t.surface,
        borderWidth: 1, borderColor: selected ? t.primaryFill : t.border,
      }}
    >
      {color ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} /> : null}
      <Text style={{ color: selected ? t.onPrimary : t.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const t = useTheme();
  const fg = tone === "good" ? t.success : tone === "warn" ? t.warning : tone === "bad" ? t.danger : t.textSecondary;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: fg }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function Banner({ tone, title, children }: { tone: "good" | "warn" | "bad"; title: string; children?: ReactNode }) {
  const t = useTheme();
  const c = tone === "good" ? t.success : tone === "warn" ? t.warning : t.danger;
  const icon = tone === "good" ? "✓" : tone === "warn" ? "≈" : "✕";
  return (
    <View accessibilityRole="alert" style={{ borderLeftWidth: 4, borderLeftColor: c, backgroundColor: t.surface, borderRadius: radius.md, padding: space.md, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }}>
      <Text style={{ color: c, fontSize: 16, fontWeight: "700" }}>{icon} {title}</Text>
      {children}
    </View>
  );
}

export function Row({ children, onPress, last }: { children: ReactNode; onPress?: () => void; last?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, minHeight: 48,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.border, opacity: pressed ? 0.6 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

export function Loading() {
  const t = useTheme();
  return <View style={{ padding: space.xl, alignItems: "center" }}><ActivityIndicator color={t.textMuted} /></View>;
}

export function ErrorText({ message }: { message: string }) {
  const t = useTheme();
  return <Text style={{ color: t.danger, fontSize: 14 }}>{message}</Text>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ padding: space.xl, alignItems: "center", gap: 6 }}>
      <Body style={{ fontWeight: "600" }}>{title}</Body>
      {hint ? <Body muted style={{ textAlign: "center" }}>{hint}</Body> : null}
    </View>
  );
}
