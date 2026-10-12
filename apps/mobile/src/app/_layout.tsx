import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const t = useTheme();
  return (
    <SessionProvider>
      <StatusBar style={t.dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
    </SessionProvider>
  );
}
