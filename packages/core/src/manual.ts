import { categorize, type CategorizeContext, type CategorySource } from "./categorize.ts";
import { addDays, diffDays, parseBrDate, splitIso, type IsoDate } from "./dates.ts";
import { decodeDescription } from "./normalize.ts";
import { sha256Hex } from "./sha256.ts";

export type ManualMethod = "pix" | "dinheiro" | "debito" | "boleto" | "outro";

export const METHOD_LABEL: Record<ManualMethod, string> = { pix: "Pix", dinheiro: "Dinheiro", debito: "Débito", boleto: "Boleto", outro: "Outro" };
const METHOD_PREFIX: Record<ManualMethod, string> = { pix: "PIX", dinheiro: "DINHEIRO", debito: "DEBITO", boleto: "BOLETO", outro: "LANC" };

export interface ManualEntryInput {
  description: string;
  amountCents: number;
  date: IsoDate;
  method: ManualMethod;
  /** null = deixar o categorizador (regras do casal) sugerir */
  categoryId: number | null;
  /** user id do dono; null = nosso */
  ownerUserId: string | null;
  isPrivate: boolean;
}

export interface ManualRow {
  posted_on: IsoDate;
  description_raw: string;
  description_clean: string;
  merchant_name: string | null;
  amount_cents: number;
  kind: "avista";
  section: "despesas";
  category_id: number | null;
  category_source: CategorySource;
  confidence: "alta" | "media" | "baixa";
  needs_review: boolean;
  owner_user_id: string | null;
  is_private: boolean;
  source: "manual";
  dedupe_hash: string;
}

export const MAX_MANUAL_CENTS = 100_000_000; // R$ 1.000.000,00

export function validateManualEntry(input: ManualEntryInput, today: IsoDate): string | null {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return "Informe um valor maior que zero.";
  if (input.amountCents > MAX_MANUAL_CENTS) return "Valor alto demais.";
  const d = input.description.trim();
  if (d.length < 2) return "Descreva o gasto (ex.: Diarista).";
  if (d.length > 80) return "Descrição longa demais (máximo 80).";
  if (diffDays(input.date, today) > 1) return "A data não pode estar no futuro.";
  if (diffDays(today, input.date) > 400) return "Data antiga demais (máximo ~13 meses).";
  if (input.isPrivate && input.ownerUserId === null) return "Gasto pessoal precisa de um dono.";
  return null;
}

/** "Lançamento rápido" (Pix, dinheiro…): monta a linha, aplicando as regras do casal quando não há categoria escolhida. */
export function buildManualRow(input: ManualEntryInput, nonce: string, ctx?: CategorizeContext): ManualRow {
  const description = input.description.trim().replace(/\s+/g, " ");
  const raw = `${METHOD_PREFIX[input.method]} ${description}`.toUpperCase();
  const suggestion = input.categoryId === null ? categorize({ description: raw, kind: "avista" }, ctx) : null;
  const categoryId = input.categoryId ?? suggestion!.categoryId;
  const needsReview = input.categoryId === null && (suggestion?.needsReview ?? true);
  return {
    posted_on: input.date,
    description_raw: raw,
    description_clean: `${METHOD_LABEL[input.method]} · ${description}`,
    merchant_name: suggestion?.merchantName ?? null,
    amount_cents: input.amountCents,
    kind: "avista",
    section: "despesas",
    category_id: categoryId,
    category_source: input.categoryId !== null ? "manual" : suggestion!.source,
    confidence: input.categoryId !== null ? "alta" : suggestion!.confidence,
    needs_review: needsReview,
    owner_user_id: input.isPrivate ? input.ownerUserId : (input.ownerUserId ?? suggestion?.ownerUserId ?? null),
    is_private: input.isPrivate,
    source: "manual",
    dedupe_hash: sha256Hex(`manual|${nonce}|${raw}|${input.date}|${input.amountCents}`),
  };
}

/** "12/10/2026" ou vazio (= hoje) → data ISO; null se inválida. */
export function parseEntryDate(text: string, today: IsoDate): IsoDate | null {
  const t = text.trim().toLowerCase();
  if (t === "" || t === "hoje") return today;
  if (t === "ontem") return addDays(today, -1);
  const short = /^(\d{2})\/(\d{2})$/.exec(t);
  try {
    if (short) return parseBrDate(`${short[1]}/${short[2]}/${splitIso(today).y}`);
    return parseBrDate(t);
  } catch {
    return null;
  }
}

export function displayName(description: string) {
  return decodeDescription(description).display;
}
