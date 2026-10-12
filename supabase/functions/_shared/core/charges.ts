// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import type { TxKind } from "./parsers/types.ts";

export interface ChargeTx {
  descriptionRaw: string;
  amountCents: number;
  kind: TxKind;
  amountUsdCents?: number | null;
}

export interface AnnuityInfo {
  installmentCents: number | null;
  paidCents: number | null;
  discountPercent: number | null;
}

export type ChargeType = "anuidade" | "iof" | "juros" | "multa" | "mora" | "seguro" | "tarifa";

export interface ChargeLine {
  type: ChargeType;
  description: string;
  cents: number;
}

export interface AvoidableCharges {
  lines: ChargeLine[];
  byType: Record<ChargeType, number>;
  /** IOF de compras no exterior (já vem ligado a uma compra em US$) */
  iofCents: number;
  /** juros + multa + mora: 100% evitáveis pagando em dia */
  lateCents: number;
  totalCents: number;
  annuity: {
    /** valor cheio da parcela mensal da anuidade */
    fullCents: number;
    /** quanto foi cobrado nesta fatura */
    paidCents: number;
    discountPercent: number;
    waived: boolean;
    /** quanto a isenção economiza por mês */
    savedPerMonthCents: number;
  } | null;
}

const RULES: [RegExp, ChargeType][] = [
  [/ANUIDADE/i, "anuidade"],
  [/\bIOF\b/i, "iof"],
  [/JUROS/i, "juros"],
  [/MULTA/i, "multa"],
  [/\bMORA\b|ATRASO/i, "mora"],
  [/SEGURO|PRESTAMISTA/i, "seguro"],
  [/TARIFA|ENCARGO/i, "tarifa"],
];

export function classifyCharge(description: string): ChargeType | null {
  for (const [re, type] of RULES) if (re.test(description)) return type;
  return null;
}

/** Encargos de uma fatura: o que o banco cobrou além das compras, e o que dava para evitar. */
export function avoidableCharges(txs: readonly ChargeTx[], annuity?: AnnuityInfo | null): AvoidableCharges {
  const byType: Record<ChargeType, number> = { anuidade: 0, iof: 0, juros: 0, multa: 0, mora: 0, seguro: 0, tarifa: 0 };
  const lines: ChargeLine[] = [];
  for (const t of txs) {
    if (t.kind !== "encargo" || t.amountCents === 0) continue;
    const type = classifyCharge(t.descriptionRaw) ?? "tarifa";
    byType[type] += t.amountCents;
    lines.push({ type, description: t.descriptionRaw, cents: t.amountCents });
  }
  const full = annuity?.installmentCents ?? 0;
  const paid = annuity?.paidCents ?? 0;
  const annuityInfo =
    annuity && full > 0
      ? { fullCents: full, paidCents: paid, discountPercent: annuity.discountPercent ?? 0, waived: paid === 0, savedPerMonthCents: full - paid }
      : null;
  return {
    lines,
    byType,
    iofCents: byType.iof,
    lateCents: byType.juros + byType.multa + byType.mora,
    totalCents: Object.values(byType).reduce((a, v) => a + v, 0),
    annuity: annuityInfo,
  };
}
