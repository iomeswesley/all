import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase, supabaseConfigured } from "./supabase";
import { clearWidget } from "@/widget/bridge";

export interface Member {
  user_id: string;
  display_name: string;
  role: "owner" | "member";
}

export type AppState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signed_out" }
  | { status: "no_household"; user: User }
  | { status: "ready"; user: User; householdId: string; householdName: string; me: Member; partner: Member | null; members: Member[] };

interface Ctx {
  state: AppState;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Ctx | null>(null);

async function loadHousehold(session: Session): Promise<AppState> {
  const { data: members, error } = await supabase.from("members").select("household_id, user_id, display_name, role");
  if (error) throw error;
  if (!members || members.length === 0) return { status: "no_household", user: session.user };

  const householdId = members[0]!.household_id as string;
  const { data: household } = await supabase.from("households").select("name").eq("id", householdId).single();
  const list = members.map((m) => ({ user_id: m.user_id as string, display_name: m.display_name as string, role: m.role as Member["role"] }));
  const me = list.find((m) => m.user_id === session.user.id)!;
  return {
    status: "ready",
    user: session.user,
    householdId,
    householdName: (household?.name as string | undefined) ?? "Casal",
    me,
    partner: list.find((m) => m.user_id !== session.user.id) ?? null,
    members: list,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({ status: supabaseConfigured ? "loading" : "unconfigured" });

  const resolve = useCallback(async (session: Session | null) => {
    if (!session) return setState({ status: "signed_out" });
    try {
      setState(await loadHousehold(session));
    } catch {
      setState({ status: "signed_out" });
    }
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Evita chamadas ao banco dentro do callback de auth (deadlock conhecido do supabase-js).
      setTimeout(() => void resolve(session), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [resolve]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await resolve(data.session);
  }, [resolve]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    void clearWidget();
    setState({ status: "signed_out" });
  }, []);

  const value = useMemo(() => ({ state, refresh, signOut }), [state, refresh, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession fora do SessionProvider");
  return ctx;
}

/** Só para telas autenticadas e com casal. */
export function useReady() {
  const { state } = useSession();
  if (state.status !== "ready") throw new Error("Tela exige casal configurado");
  return state;
}
