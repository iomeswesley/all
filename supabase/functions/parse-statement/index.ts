// Edge Function: lê uma fatura/extrato (PDF Santander, OFX ou JSON assistido, no bucket privado) e grava um rascunho para conferência.
// Roda com o JWT do usuário: nenhuma chave de serviço, e a RLS vale para tudo.
//
// POST { path: "<household_id>/<arquivo>.(pdf|ofx|json)", accountId?: string, password?: string }
import { createClient } from "@supabase/supabase-js";
import { getDocumentProxy } from "unpdf";
import { itemsFromPdfDocument } from "../_shared/core/pdf/items.ts";
import { decodeOfxBytes, detectFormatFromName, type ImportSource } from "../_shared/core/parsers/index.ts";
import { processStatement } from "./process.ts";
import { supabaseStore } from "./supabase-store.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);

  let body: { path?: string; accountId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const format = body.path ? detectFormatFromName(body.path) : null;
  if (!body.path || !format || !/^[0-9a-f-]{36}\/[\w.-]+\.(pdf|ofx|qfx|json|txt)$/i.test(body.path)) return json({ error: "invalid_path" }, 400);

  const store = supabaseStore(db);
  try {
    const householdId = await store.householdId();
    if (!body.path.startsWith(`${householdId}/`)) return json({ error: "forbidden" }, 403);

    const file = await db.storage.from("statements").download(body.path);
    if (file.error || !file.data) return json({ error: "file_not_found" }, 404);
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    const sha256 = await sha256Hex(bytes);

    let source: ImportSource;
    if (format === "pdf") {
      try {
        const pdf = await getDocumentProxy(bytes.slice(), body.password ? { password: body.password } : undefined);
        source = { format: "pdf", items: await itemsFromPdfDocument(pdf) };
      } catch (e) {
        const name = (e as { name?: string }).name;
        if (name === "PasswordException") return json({ error: body.password ? "wrong_password" : "password_required" }, 422);
        return json({ error: "unreadable_pdf", message: "Não consegui abrir o PDF." }, 422);
      }
    } else if (format === "ofx") {
      source = { format: "ofx", text: decodeOfxBytes(bytes) };
    } else {
      source = { format: "json", text: new TextDecoder().decode(bytes) };
    }

    const result = await processStatement(store, { source, sha256, filePath: body.path, userId: userData.user.id, accountId: body.accountId });
    return json(result, result.status === "unsupported" ? 422 : 200);
  } catch (e) {
    console.error("parse-statement", (e as Error).message); // sem dados da fatura nos logs
    return json({ error: "internal_error" }, 500);
  }
});
