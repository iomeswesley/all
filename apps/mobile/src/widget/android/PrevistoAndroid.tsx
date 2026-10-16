import type { WidgetPayload } from "@financas/core";
import { FlexWidget, TextWidget } from "react-native-android-widget";

/**
 * Layout do App Widget Android (react-native-android-widget). Só é carregado quando o módulo
 * nativo AndroidWidget existe (development build) — ver ../bridge.ts e ../register.ts.
 * O nome "PrevistoWidget" precisa bater com app.json → plugins → react-native-android-widget.
 */
export const ANDROID_WIDGET_NAME = "PrevistoWidget";

const LIGHT = { bg: "#ffffff", fg: "#121211", muted: "#5c5c57", accent: "#1c68c4" } as const;
const DARK = { bg: "#1f1f1d", fg: "#f5f5f2", muted: "#a3a39e", accent: "#7fb2f0" } as const;

function Layout({ p, c }: { p: WidgetPayload; c: typeof LIGHT | typeof DARK }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: p.openUrl }}
      accessibilityLabel={`${p.heading}: ${p.amount}`}
      style={{ height: "match_parent", width: "match_parent", backgroundColor: c.bg, borderRadius: 16, padding: 12, flexDirection: "column", justifyContent: "space-between" }}
    >
      <FlexWidget style={{ flexDirection: "column", width: "match_parent" }}>
        <TextWidget text={p.heading} maxLines={1} truncate="END" style={{ fontSize: 13, fontWeight: "600", color: c.muted }} />
        <TextWidget text={p.amount} maxLines={1} truncate="END" style={{ fontSize: 24, fontWeight: "700", color: c.fg }} />
        <TextWidget text={p.detail} maxLines={1} truncate="END" style={{ fontSize: 12, color: c.muted }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: "row", width: "match_parent", alignItems: "center", justifyContent: "space-between" }}>
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget text={p.nextLine} maxLines={2} truncate="END" style={{ fontSize: 12, color: c.fg }} />
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: p.actionUrl }}
          accessibilityLabel="Lançar gasto"
          style={{ backgroundColor: c.accent, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 }}
        >
          <TextWidget text={p.actionLabel} style={{ fontSize: 14, fontWeight: "700", color: c === DARK ? "#121211" : "#ffffff" }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

/** Representação claro/escuro: o Android escolhe conforme o tema do sistema. */
export function renderPrevisto(p: WidgetPayload) {
  return { light: <Layout p={p} c={LIGHT} />, dark: <Layout p={p} c={DARK} /> };
}
