import { supabase } from "./supabase";

export interface AccountRow {
  id: string;
  kind: "credit_card" | "checking";
  institution: string;
  name: string;
  /** a conta "Pix e dinheiro" é automática: não recebe importação */
  isCash: boolean;
  statements: number;
}

export const INSTITUTIONS = ["Santander", "Nubank", "Itaú", "Bradesco", "Banco do Brasil", "Inter", "C6 Bank", "Caixa", "Outro"] as const;

export async function fetchAccounts(): Promise<AccountRow[]> {
  const [accounts, statements] = await Promise.all([
    supabase.from("accounts").select("id, kind, institution, name").order("created_at"),
    supabase.from("statements").select("account_id"),
  ]);
  if (accounts.error) throw new Error(accounts.error.message);
  const counts = new Map<string, number>();
  for (const s of statements.data ?? []) counts.set(s.account_id as string, (counts.get(s.account_id as string) ?? 0) + 1);
  return (accounts.data ?? []).map((a) => ({
    id: a.id as string,
    kind: a.kind as AccountRow["kind"],
    institution: a.institution as string,
    name: a.name as string,
    isCash: a.institution === "manual",
    statements: counts.get(a.id as string) ?? 0,
  }));
}

export async function createAccount(householdId: string, a: { name: string; institution: string; kind: AccountRow["kind"] }) {
  const name = a.name.trim();
  if (name.length < 2) throw new Error("Dê um nome à conta (ex.: Nubank cartão).");
  const { error } = await supabase.from("accounts").insert({ household_id: householdId, name, institution: a.institution.trim().toLowerCase().slice(0, 40) || "outro", kind: a.kind });
  if (error) throw new Error(error.message);
}

export async function renameAccount(id: string, name: string) {
  const n = name.trim();
  if (n.length < 2) throw new Error("O nome precisa ter pelo menos 2 letras.");
  const { error } = await supabase.from("accounts").update({ name: n }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Apaga a conta com as faturas e lançamentos (cascata) e remove os PDFs/arquivos enviados. */
export async function deleteAccount(id: string) {
  const files = await supabase.from("statements").select("file_path").eq("account_id", id);
  const paths = (files.data ?? []).map((f) => f.file_path as string);
  if (paths.length) await supabase.storage.from("statements").remove(paths);
  const receipts = await supabase.from("transactions").select("attachment_path").eq("account_id", id).not("attachment_path", "is", null);
  const rp = (receipts.data ?? []).map((r) => r.attachment_path as string);
  if (rp.length) await supabase.storage.from("receipts").remove(rp);
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
