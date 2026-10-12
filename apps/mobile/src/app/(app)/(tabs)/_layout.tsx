import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const t = useTheme();
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: import("react-native").ColorValue; size: number }) => <Ionicons name={name} size={size} color={color} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Início", tabBarIcon: icon("pie-chart-outline") }} />
      <Tabs.Screen name="importar" options={{ title: "Importar", tabBarIcon: icon("cloud-upload-outline") }} />
      <Tabs.Screen name="revisar" options={{ title: "Revisar", tabBarIcon: icon("checkmark-done-outline") }} />
      <Tabs.Screen name="parcelas" options={{ title: "Parcelas", tabBarIcon: icon("calendar-outline") }} />
      <Tabs.Screen name="mais" options={{ title: "Mais", tabBarIcon: icon("ellipsis-horizontal") }} />
    </Tabs>
  );
}
