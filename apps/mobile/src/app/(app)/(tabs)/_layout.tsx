import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Início", tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="planejar" options={{ title: "Planejar", tabBarIcon: ({ color, size }) => <Ionicons name="trending-up-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="importar" options={{ title: "Importar", tabBarIcon: ({ color, size }) => <Ionicons name="cloud-upload-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="revisar" options={{ title: "Revisar", tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="mais" options={{ title: "Mais", tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" size={size} color={color} /> }} />
    </Tabs>
  );
}
