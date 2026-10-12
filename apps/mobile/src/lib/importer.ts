import { detectFormatFromName, type FileFormat } from "@financas/core";
import { randomUUID } from "expo-crypto";
import { supabase } from "./supabase";

export interface ImportResponse {
  status?: "ok" | "duplicate_file" | "already_confirmed" | "unsupported" | "nothing_new" | "overlap_with_total";
  statementId?: string;
  message?: string;
  error?: string;
  confirmed?: boolean;
  skippedDuplicates?: number;
  reconcile?: { status: string };
}

const ERRORS: Record<string, string> = {
  password_required: "Este PDF tem senha.",
  wrong_password: "Senha incorreta. Tente de novo.",
  unreadable_pdf: "Não consegui abrir este PDF.",
  file_not_found: "O arquivo não chegou ao servidor. Tente de novo.",
  invalid_path: "Tipo de arquivo não suportado. Use PDF, OFX ou JSON.",
};

export const errorText = (code: string) => ERRORS[code] ?? "Algo deu errado ao ler o arquivo.";

/** Texto para o que a função respondeu (ou null quando deu certo e só falta abrir a conferência). */
export function describeResult(res: ImportResponse): { message: string | null; open?: string; needsPassword?: boolean; wrongPassword?: boolean } {
  if (res.error === "password_required" || res.error === "wrong_password") return { message: res.error === "wrong_password" ? ERRORS.wrong_password! : null, needsPassword: true, wrongPassword: res.error === "wrong_password" };
  if (res.error) return { message: errorText(res.error) };
  switch (res.status) {
    case "unsupported":
      return { message: res.message ?? "Não consegui ler este arquivo." };
    case "duplicate_file":
      return { message: "Este arquivo já foi enviado.", open: res.statementId };
    case "already_confirmed":
      return { message: "Já existe uma fatura confirmada para este período.", open: res.statementId };
    case "nothing_new":
      return { message: `Não há nada novo: os ${res.skippedDuplicates ?? 0} lançamentos deste arquivo já foram importados.` };
    case "overlap_with_total":
      return { message: res.message ?? "Este arquivo repete lançamentos já importados." };
    case "ok":
      return { message: null, open: res.statementId };
    default:
      return { message: "Resposta inesperada do servidor." };
  }
}

export interface UploadInput {
  householdId: string;
  accountId: string;
  fileName: string;
  body: ArrayBuffer | Uint8Array;
  password?: string;
}

/** Sobe o arquivo para o bucket privado e pede à função para ler. */
export async function uploadAndParse(input: UploadInput): Promise<{ path: string; format: FileFormat; response: ImportResponse }> {
  const format = detectFormatFromName(input.fileName);
  if (!format) throw new Error("Tipo de arquivo não suportado. Use PDF, OFX ou JSON.");
  const ext = format === "ofx" ? (input.fileName.toLowerCase().endsWith(".qfx") ? "qfx" : "ofx") : format;
  const path = `${input.householdId}/${randomUUID()}.${ext}`;
  const contentType = format === "pdf" ? "application/pdf" : format === "json" ? "application/json" : "application/x-ofx";
  const up = await supabase.storage.from("statements").upload(path, input.body, { contentType, upsert: false });
  if (up.error) throw new Error("Não consegui enviar o arquivo.");
  return { path, format, response: await parse(path, input.accountId, input.password) };
}

export async function parse(path: string, accountId: string, password?: string): Promise<ImportResponse> {
  const { data, error } = await supabase.functions.invoke<ImportResponse>("parse-statement", { body: { path, accountId, password } });
  if (!error) return data ?? {};
  // erros HTTP (422 etc.) trazem o corpo da resposta no contexto
  const ctx = (error as { context?: Response }).context;
  const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
  if (body) return body as ImportResponse;
  throw new Error("Não consegui falar com o servidor. Confira a internet e se a função foi publicada.");
}
