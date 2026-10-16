import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { supabase } from "./supabase";
import { clearWidget } from "@/widget/bridge";

/** Exporta os dados que a pessoa pode ver (JSON) e abre a folha de compartilhamento. */
export async function exportMyData(): Promise<void> {
  const { data, error } = await supabase.rpc("export_household_data");
  if (error) throw new Error("Não consegui reunir seus dados.");
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `financas-casal-${stamp}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(data, null, 2));
  if (!(await Sharing.isAvailableAsync())) throw new Error("Este aparelho não tem compartilhamento de arquivos.");
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json", dialogTitle: "Exportar meus dados" });
}

export async function leaveHousehold() {
  const { error } = await supabase.rpc("leave_household");
  if (error) throw new Error(error.message.includes("last_member") ? "Você é a única pessoa do casal. Para sair, exclua o casal ou a conta." : error.message);
}

export async function removeMember(userId: string) {
  const { error } = await supabase.rpc("remove_member", { p_user: userId });
  if (error) throw new Error(error.message);
}

/** Remove todos os arquivos do casal nos dois buckets (a RLS só deixa o próprio casal). */
async function purgeStorage(householdId: string) {
  for (const bucket of ["statements", "receipts"]) {
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(householdId, { limit: 100 });
      if (error || !data || data.length === 0) break;
      await supabase.storage.from(bucket).remove(data.map((f) => `${householdId}/${f.name}`));
    }
  }
}

/**
 * Apaga o casal inteiro (para os dois): arquivos primeiro (depois do banco a pessoa perde o direito de apagá-los),
 * depois o banco. A tela só chama isto com o nome exato e para quem é dono (ou a única pessoa).
 * Se o banco falhar depois, nada se perde de importante: os dados seguem lá e dá para tentar de novo.
 */
export async function deleteHousehold(householdId: string, confirmName: string) {
  await purgeStorage(householdId);
  const { error } = await supabase.rpc("delete_household", { p_confirm_name: confirmName });
  if (error) throw new Error(error.message.includes("confirm_mismatch") ? "O nome digitado não confere." : error.message);
}

/** Exclui a conta de quem está logado (e o casal, se for a única pessoa), pela função do servidor. */
export async function deleteMyAccount() {
  const { error } = await supabase.functions.invoke("delete-account", { body: { confirm: "EXCLUIR" } });
  if (error) throw new Error("Não consegui excluir a conta agora. Tente de novo; nada foi perdido pela metade.");
  await supabase.auth.signOut();
  void clearWidget();
}
