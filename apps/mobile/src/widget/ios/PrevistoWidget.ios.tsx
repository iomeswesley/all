import { Link, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import { containerBackground, font, foregroundStyle, lineLimit, minimumScaleFactor, widgetURL } from "@expo/ui/swift-ui/modifiers";
import type { WidgetPayload } from "@financas/core";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

/**
 * Widget iOS (WidgetKit via expo-widgets). Este arquivo só é carregado (require preguiçoso em
 * ../bridge.ts) quando o módulo nativo ExpoWidgets existe, ou seja, num development build.
 *
 * A função marcada com 'widget' roda num runtime isolado da extensão: só componentes de
 * @expo/ui/swift-ui, sem hooks e sem nada declarado fora dela (cores ficam aqui dentro).
 * O nome "PrevistoWidget" precisa bater com app.json → plugins → expo-widgets → widgets[].name.
 */
const PrevistoWidget = (props: WidgetPayload, environment: WidgetEnvironment) => {
  "widget";
  const dark = environment.colorScheme === "dark";
  const bg = dark ? "#121211" : "#ffffff";
  const fg = dark ? "#f5f5f2" : "#121211";
  const muted = dark ? "#a3a39e" : "#5c5c57";
  const accent = dark ? "#7fb2f0" : "#1c68c4";
  const small = environment.widgetFamily === "systemSmall";
  const heading = props.heading ?? "Previsto do mês";
  const amount = props.amount ?? "—";
  const action = props.actionLabel ?? "+ Lançar";

  if (small) {
    // widget pequeno só aceita um toque: ele todo abre o "+ Lançar"
    return (
      <VStack alignment="leading" spacing={2} modifiers={[widgetURL(props.actionUrl), containerBackground(bg, "widget")]}>
        <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(muted), lineLimit(1)]}>{heading}</Text>
        <Text modifiers={[font({ size: 22, weight: "bold" }), foregroundStyle(fg), lineLimit(1), minimumScaleFactor(0.6)]}>{amount}</Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(2)]}>{props.nextLine ?? ""}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 14, weight: "bold" }), foregroundStyle(accent)]}>{action}</Text>
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={3} modifiers={[widgetURL(props.openUrl), containerBackground(bg, "widget")]}>
      <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(muted), lineLimit(1)]}>{heading}</Text>
      <Text modifiers={[font({ size: 26, weight: "bold" }), foregroundStyle(fg), lineLimit(1), minimumScaleFactor(0.6)]}>{amount}</Text>
      <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(1)]}>{props.detail ?? ""}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 12 }), foregroundStyle(fg), lineLimit(1)]}>{props.nextLine ?? ""}</Text>
      <Link destination={props.actionUrl}>
        <Text modifiers={[font({ size: 15, weight: "bold" }), foregroundStyle(accent)]}>{action}</Text>
      </Link>
    </VStack>
  );
};

export default createWidget("PrevistoWidget", PrevistoWidget);
