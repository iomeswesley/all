// Edge Function: exclui a conta de quem chama (e os dados do casal, se for a única pessoa).
// POST { confirm: "EXCLUIR" } — o JWT é verificado; a chave de serviço só apaga arquivos e o próprio usuário do JWT.
import { createClient } from "@supabase/supabase-js";
import { deleteAccount } from "./process.ts";
import { accountSupabaseStore } from "./supabase-store.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error } = await userClient.auth.getUser();
  if (error || !u.user) return json({ error: "unauthorized" }, 401);

  let body: { confirm?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (body.confirm !== "EXCLUIR") return json({ error: "confirmation_required" }, 400);

  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!service) return json({ error: "server_not_configured" }, 500);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    return json(await deleteAccount(accountSupabaseStore(userClient, admin, u.user.id)));
  } catch (e) {
    console.error("delete-account", (e as Error).message); // sem dados pessoais nos logs
    return json({ error: "internal_error" }, 500);
  }
});
