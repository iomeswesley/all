import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { listenNotificationTaps } from "@/lib/push";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const t = useTheme();
  const router = useRouter();
  useEffect(() => {
    let cleanup = () => {};
    void listenNotificationTaps((route) => router.push(route as never)).then((c) => (cleanup = c));
    return () => cleanup();
  }, [router]);
  return (
    <SessionProvider>
      <StatusBar style={t.dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
    </SessionProvider>
  );
}
