import * as ImagePicker from "expo-image-picker";
import { EDUCATION_LIMIT_CENTS_DEFAULT, type TaxKind } from "@financas/core";
import { supabase } from "./supabase";

// ───────────── configurações do casal (renda, fixos fora do cartão, limite de educação)
export interface Settings {
  monthlyIncomeCents: number;
  otherFixedCents: number;
  educationLimitCents: number;
}

export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await supabase.from("household_settings").select("monthly_income_cents, other_fixed_cents, education_limit_cents").maybeSingle();
  if (error) throw new Error(error.message);
  return {
    monthlyIncomeCents: Number(data?.monthly_income_cents ?? 0),
    otherFixedCents: Number(data?.other_fixed_cents ?? 0),
    educationLimitCents: Number(data?.education_limit_cents ?? EDUCATION_LIMIT_CENTS_DEFAULT),
  };
}

export async function saveSettings(householdId: string, patch: Partial<Settings>) {
  const row: Record<string, unknown> = { household_id: householdId, updated_at: new Date().toISOString() };
  if (patch.monthlyIncomeCents !== undefined) row.monthly_income_cents = patch.monthlyIncomeCents;
  if (patch.otherFixedCents !== undefined) row.other_fixed_cents = patch.otherFixedCents;
  if (patch.educationLimitCents !== undefined) row.education_limit_cents = patch.educationLimitCents;
  const { error } = await supabase.from("household_settings").upsert(row, { onConflict: "household_id" });
  if (error) throw new Error(error.message);
}

// ───────────── metas
export interface Goal {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  dueDate: string | null;
}

export async function fetchGoals(): Promise<Goal[]> {
  const { data, error } = await supabase.from("goals").select("id, name, target_cents, saved_cents, due_date").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((g) => ({ id: g.id as string, name: g.name as string, targetCents: Number(g.target_cents), savedCents: Number(g.saved_cents), dueDate: (g.due_date as string | null) ?? null }));
}

export async function createGoal(householdId: string, g: { name: string; targetCents: number; dueDate: string | null }) {
  const { error } = await supabase.from("goals").insert({ household_id: householdId, name: g.name, target_cents: g.targetCents, due_date: g.dueDate });
  if (error) throw new Error(error.message);
}

export async function setGoalSaved(id: string, savedCents: number) {
  const { error } = await supabase.from("goals").update({ saved_cents: Math.max(savedCents, 0) }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteGoal(id: string) {
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ───────────── perguntas salvas
export interface SavedQuery {
  id: string;
  name: string;
  question: string;
}

export async function fetchSavedQueries(): Promise<SavedQuery[]> {
  const { data, error } = await supabase.from("saved_queries").select("id, name, question").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedQuery[];
}

export async function saveQuery(householdId: string, userId: string, name: string, question: string) {
  const { error } = await supabase.from("saved_queries").insert({ household_id: householdId, created_by: userId, name: name.slice(0, 60), question: question.slice(0, 300) });
  if (error) throw new Error(error.message);
}

export async function deleteQuery(id: string) {
  const { error } = await supabase.from("saved_queries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ───────────── IR: dedução e comprovante
export async function updateTax(txId: string, patch: { taxDeductible?: boolean; taxKind?: TaxKind | null }) {
  const row: Record<string, unknown> = {};
  if (patch.taxDeductible !== undefined) row.tax_deductible = patch.taxDeductible;
  if (patch.taxKind !== undefined) row.tax_kind = patch.taxKind;
  const { error } = await supabase.from("transactions").update(row).eq("id", txId);
  if (error) throw new Error(error.message);
}

export async function pickReceipt(source: "camera" | "library"): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Permissão negada. Ative a câmera/fotos nas configurações do celular.");
  const res =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
  return res.canceled ? null : (res.assets[0] ?? null);
}

/** Sobe a foto para o bucket privado `receipts` (pasta do casal) e liga ao lançamento. */
export async function attachReceipt(householdId: string, txId: string, asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const ext = asset.mimeType?.includes("png") ? "png" : "jpg";
  const path = `${householdId}/${txId}-${Date.now()}.${ext}`;
  const body = await (await fetch(asset.uri)).arrayBuffer();
  const up = await supabase.storage.from("receipts").upload(path, body, { contentType: asset.mimeType ?? "image/jpeg", upsert: false });
  if (up.error) throw new Error("Não consegui enviar a foto.");
  const { error } = await supabase.from("transactions").update({ attachment_path: path, tax_deductible: true }).eq("id", txId);
  if (error) throw new Error(error.message);
  return path;
}

export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 120);
  if (error || !data) throw new Error("Não consegui abrir o comprovante.");
  return data.signedUrl;
}

export async function removeReceipt(txId: string, path: string) {
  await supabase.storage.from("receipts").remove([path]);
  const { error } = await supabase.from("transactions").update({ attachment_path: null }).eq("id", txId);
  if (error) throw new Error(error.message);
}
