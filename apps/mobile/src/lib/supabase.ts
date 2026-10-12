import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** False até o usuário criar o .env (a tela inicial explica como). */
export const supabaseConfigured = Boolean(url && anonKey && !url.includes("SEU-PROJETO"));

// Só a chave pública (anon). Quem protege os dados é a RLS do banco; nunca use a service_role aqui.
export const supabase = createClient(url ?? "http://localhost:54321", anonKey ?? "anon", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Renovar o token só com o app aberto (recomendação do supabase-js para React Native).
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
