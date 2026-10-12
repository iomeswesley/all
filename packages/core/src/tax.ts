import { formatNumberBR } from "./money.ts";
import { CAT } from "./categories.ts";
import { matchKey } from "./normalize.ts";

/** Limite anual de dedução com instrução por pessoa. Confira o valor vigente na Receita antes de declarar. */
export const EDUCATION_LIMIT_CENTS_DEFAULT = 356150;

export type TaxKind = "saude" | "educacao" | "outros";

export interface TaxTx {
  id: string;
  postedOn: string;
  descriptionClean: string;
  descriptionRaw?: string;
  amountCents: number;
  categoryId: number | null;
  taxDeductible: boolean;
  taxKind?: TaxKind | null;
  attachmentPath?: string | null;
  ownerUserId: string | null;
}

const PHARMACY = /FARMA|DROG|PANVEL|\bRAIA\b|PAGUE MENOS|MANIPULA/;
const NOT_HEALTH = /ACADEMIA|SMART ?FIT|TOTAL ?PASS|SUPLEMENT|\bGYM\b|PILATES|YOGA/;

export interface TaxSuggestion {
  kind: TaxKind | null;
  note?: string;
}

/**
 * Sugestão (nunca automática): saúde e educação costumam ser dedutíveis, mas medicamentos
 * (fora de internação) e academia não são. A decisão final é sempre da pessoa.
 */
export function suggestTaxKind(categoryId: number | null, description: string): TaxSuggestion {
  const key = matchKey(description);
  if (categoryId === CAT.SAUDE) {
    if (PHARMACY.test(key)) return { kind: null, note: "Medicamento/farmácia em geral não é dedutível (exceto durante internação)." };
    if (NOT_HEALTH.test(key)) return { kind: null, note: "Academia e atividade física não são dedutíveis." };
    return { kind: "saude" };
  }
  if (categoryId === CAT.EDUCACAO) {
    if (/LIVRARIA|LIVRO/.test(key)) return { kind: null, note: "Material didático e livros não são dedutíveis." };
    return { kind: "educacao" };
  }
  return { kind: null };
}

export function taxCandidates(txs: readonly TaxTx[], year: number): TaxTx[] {
  return txs.filter((t) => t.postedOn.startsWith(`${year}-`) && t.amountCents > 0 && !t.taxDeductible && suggestTaxKind(t.categoryId, t.descriptionRaw ?? t.descriptionClean).kind !== null);
}

export interface TaxSection {
  kind: TaxKind;
  totalCents: number;
  /** o que entra na declaração (educação respeita o limite anual por pessoa) */
  deductibleCents: number;
  items: TaxTx[];
  missingReceipts: number;
}

export interface TaxReport {
  year: number;
  sections: TaxSection[];
  totalCents: number;
  totalDeductibleCents: number;
  missingReceipts: number;
  educationLimitCents: number;
}

export function taxReport(txs: readonly TaxTx[], year: number, opts: { educationLimitCents?: number; ownerUserId?: string | null | "all" } = {}): TaxReport {
  const limit = opts.educationLimitCents ?? EDUCATION_LIMIT_CENTS_DEFAULT;
  const owner = opts.ownerUserId ?? "all";
  const marked = txs.filter((t) => t.taxDeductible && t.postedOn.startsWith(`${year}-`) && (owner === "all" || t.ownerUserId === owner));
  const kinds: TaxKind[] = ["saude", "educacao", "outros"];
  const sections: TaxSection[] = kinds
    .map((kind) => {
      const items = marked
        .filter((t) => (t.taxKind ?? suggestTaxKind(t.categoryId, t.descriptionRaw ?? t.descriptionClean).kind ?? "outros") === kind)
        .sort((a, b) => a.postedOn.localeCompare(b.postedOn));
      const total = items.reduce((a, t) => a + t.amountCents, 0);
      return { kind, totalCents: total, deductibleCents: kind === "educacao" ? Math.min(total, limit) : total, items, missingReceipts: items.filter((t) => !t.attachmentPath).length };
    })
    .filter((s) => s.items.length > 0);
  return {
    year,
    sections,
    totalCents: sections.reduce((a, s) => a + s.totalCents, 0),
    totalDeductibleCents: sections.reduce((a, s) => a + s.deductibleCents, 0),
    missingReceipts: sections.reduce((a, s) => a + s.missingReceipts, 0),
    educationLimitCents: limit,
  };
}

const KIND_LABEL: Record<TaxKind, string> = { saude: "Saúde", educacao: "Educação", outros: "Outros" };

const csvCell = (s: string) => (/[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

/** CSV com separador ";" e vírgula decimal (abre direto no Excel/Sheets em pt-BR). */
export function taxCsv(report: TaxReport, ownerName: (id: string | null) => string): string {
  const lines = [["Ano", "Tipo", "Data", "Descrição", "Pessoa", "Valor (R$)", "Comprovante"].join(";")];
  for (const s of report.sections) {
    for (const t of s.items) {
      const [y, m, d] = t.postedOn.split("-");
      lines.push([report.year, KIND_LABEL[s.kind], `${d}/${m}/${y}`, csvCell(t.descriptionClean), csvCell(ownerName(t.ownerUserId)), formatNumberBR(t.amountCents), t.attachmentPath ? "sim" : "FALTA"].join(";"));
    }
    lines.push(["", `Total ${KIND_LABEL[s.kind]}`, "", "", "", formatNumberBR(s.totalCents), ""].join(";"));
    if (s.kind === "educacao" && s.deductibleCents < s.totalCents) {
      lines.push(["", "Educação — dedutível até o limite", "", "", "", formatNumberBR(s.deductibleCents), ""].join(";"));
    }
  }
  lines.push(["", "TOTAL DEDUTÍVEL", "", "", "", formatNumberBR(report.totalDeductibleCents), ""].join(";"));
  return lines.join("\n");
}
