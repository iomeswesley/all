// Edge Function: avisos (orçamento 80%/100% e aviso ao par) depois de confirmar fatura ou lançar manualmente.
// POST { statementId } | { txId }  — roda com o JWT do usuário; a RLS vale.
import { createClient } from "@supabase/supabase-js";
import { notifyManualEntry, notifyStatementConfirmed, type PushSender } from "./process.ts";
import { notifySupabaseStore } from "./supabase-store.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** API pública de push do Expo (sem chave). Falha de entrega não derruba a função. */
const expoSender: PushSender = {
  async send(messages) {
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100).map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data, sound: "default", ...(m.categoryIdentifier ? { categoryId: m.categoryIdentifier } : {}) }));
      try {
        await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(batch) });
      } catch (e) {
        console.error("expo push", (e as Error).message);
      }
    }
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error } = await db.auth.getUser();
  if (error || !u.user) return json({ error: "unauthorized" }, 401);

  let body: { statementId?: string; txId?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const isId = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
  if (!isId(body.statementId) && !isId(body.txId)) return json({ error: "invalid_request" }, 400);

  try {
    const store = notifySupabaseStore(db, u.user.id);
    const result = isId(body.txId) ? await notifyManualEntry(store, expoSender, body.txId!) : await notifyStatementConfirmed(store, expoSender, body.statementId!);
    return json(result, result.status === "ok" ? 200 : 409);
  } catch (e) {
    console.error("notify", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
