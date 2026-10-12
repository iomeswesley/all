import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { listenNotificationTaps } from "@/lib/push";
import { StatusBar } from "expo-status-bar";
import { PrefsProvider } from "@/lib/prefs";
import { SessionProvider } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const router = useRouter();
  useEffect(() => {
    let cleanup = () => {};
    void listenNotificationTaps((route) => router.push(route as never)).then((c) => (cleanup = c));
    return () => cleanup();
  }, [router]);
  return (
    <PrefsProvider>
      <SessionProvider>
        <Themed />
      </SessionProvider>
    </PrefsProvider>
  );
}

function Themed() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
    </>
  );
}
