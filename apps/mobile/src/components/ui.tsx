import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatBRL } from "@financas/core";
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
  return <View style={[{ backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, padding: space.lg, gap: space.md }, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: "700", color: t.text }}>{children}</Text>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: "600", color: t.text }}>{children}</Text>
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
  const bg = variant === "primary" ? t.primary : variant === "danger" ? t.danger : "transparent";
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
        paddingVertical: small ? 8 : 13,
        paddingHorizontal: small ? 12 : 18,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        opacity: off ? 0.5 : pressed ? 0.8 : 1,
        minHeight: small ? 36 : 48,
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
        paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, minHeight: 36,
        backgroundColor: selected ? t.primary : t.surface,
        borderWidth: 1, borderColor: selected ? t.primary : t.border,
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
