// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { CAT } from "./categories.ts";
import { decodeDescription, matchKey } from "./normalize.ts";
import { MERCHANT_SEEDS, type Confidence, type MatchType, type MerchantSeed } from "./seeds/merchants.ts";
import type { TxKind } from "./parsers/types.ts";

export type CategorySource = "rule" | "merchant" | "heuristic" | "manual" | "none";

export interface Merchant {
  pattern: string;
  matchType: MatchType;
  realName: string;
  segment?: string | null;
  categoryId: number;
  confidence: Confidence;
}

export interface Rule {
  pattern: string;
  matchType: MatchType;
  categoryId: number | null;
  /** dono fixo (user id) aplicado a lançamentos que casarem; null = não altera */
  ownerUserId?: string | null;
  /** menor número = avalia primeiro */
  priority?: number;
}

export interface CategorizeContext {
  /** regras do casal (vencem o dicionário) */
  rules?: readonly Rule[];
  /** dicionário do casal (vence o global) */
  householdMerchants?: readonly Merchant[];
  /** dicionário global; por padrão, o seed */
  globalMerchants?: readonly Merchant[];
}

export interface Categorization {
  categoryId: number | null;
  source: CategorySource;
  confidence: Confidence;
  /** nome real do estabelecimento (do dicionário), quando conhecido */
  merchantName: string | null;
  ownerUserId: string | null;
  /** True quando deve cair na fila "Revisar" */
  needsReview: boolean;
}

export function patternMatches(key: string, pattern: string, type: MatchType): boolean {
  const p = matchKey(pattern);
  switch (type) {
    case "prefix":
      return key.startsWith(p);
    case "contains":
      return key.includes(p);
    case "regex":
      try {
        return new RegExp(pattern, "i").test(key);
      } catch {
        return false;
      }
  }
}

/**
 * Heurísticas por palavras (último recurso antes da fila "Revisar").
 * Palavras longas e distintivas casam em qualquer posição (nomes vêm colados:
 * "PITTOLCALCADOS"); palavras curtas exigem fronteira ("BAR" ≠ "BARBEARIA").
 */
const HEURISTICS: readonly { re: RegExp; categoryId: number }[] = [
  { re: /AUTO\s?POSTO|\bPOSTO\b|COMBUSTIVE|AUTOMOTIV|MECANIC|PNEU|AUTO\s?PECAS|\bOFICINA\b|ESTACIONAMENTO|PEDAGIO|\bTAXI\b/, categoryId: CAT.TRANSPORTE },
  { re: /SUPERMERC|MINIMERC|HIPERMERC|ATACADIST|ATACAREJO|HORTIFRUT|ACOUGUE|\bMERCADO\b|\bMERCADO[A-Z]/, categoryId: CAT.MERCADO },
  { re: /RESTAUR|LANCHE|PIZZ|CHURRASC|BURGER|BURGAO|HAMBURG|SUSHI|CAFETERIA|GASTRONOM|SORVET|DOCERIA|CONFEIT|PADARIA|PANIFICADORA|PASTELARIA|KALZONE|BOTECO|BUTECO|CHOPP|CERVEJARIA|ESPETARIA|TRATTORIA|RISOTTERIA|CANTINA\b|COMIDA|CAMARAO|PEIXARIA|FOGAO|\bPAES\b|\b(CAFE|BAR|GRILL|PADO|PANIF|COZINHA|COZINHAS)\b/, categoryId: CAT.RESTAURANTE },
  { re: /DROGARIA|DROGA|FARMA|PANVEL|MANIPULA|\bOTICA\b|CLINICA|LABORAT|HOSPITAL|ODONTO|MEDIC|DENTAL|FISIOTER|PSICOLOG/, categoryId: CAT.SAUDE },
  { re: /INGRESSO|TICKET|CINEMA|TEATRO|\bSHOWS?\b|PARQUE|BOLICHE|KARTING|KARTODROMO|EVENTOS|\bCLUBE\b/, categoryId: CAT.LAZER },
  { re: /HOTEL|POUSADA|HOSTEL|\bRESORT\b|PASSAGEM|AEREO|TURISMO|TURISTIC|ATRATIVOS/, categoryId: CAT.VIAGEM },
  { re: /ESCOLA|COLEGIO|FACULDADE|\bCURSOS?\b|UNIVERSIDADE|LIVRARIA/, categoryId: CAT.EDUCACAO },
  { re: /MOVEIS|CONSTRU|MATERIAIS|FERRAGEM|ELETRICA|DECORA|COLCHO/, categoryId: CAT.CASA },
  { re: /BARBEARIA|\bSALAO\b|ESTETICA|CABELEIREIR|LAVANDERIA/, categoryId: CAT.SERVICOS },
  { re: /COSMETIC|CALCADO|\bMODAS?\b|BOUTIQUE|JOIAS|SEMIJOIA|PRESENTES|VAREJO|MAGAZINE|\bLOJAS?\b|SURF\s?SHOP|BOLSAS|AROMAS|PERFUMA|\bSHOP\b/, categoryId: CAT.COMPRAS },
];

const KIND_ENCARGO = /\b(ANUIDADE|IOF|JUROS|MULTA|MORA|SEGURO|TARIFA|ENCARGO)\b/;

export interface CategorizeInput {
  description: string;
  kind: TxKind;
}

export function categorize(input: CategorizeInput, ctx: CategorizeContext = {}): Categorization {
  const decoded = decodeDescription(input.description);
  const keys = decoded.processor ? [decoded.key, decoded.vendorKey] : [decoded.key];
  const none = (confidence: Confidence = "baixa"): Categorization => ({
    categoryId: CAT.OUTROS, source: "none", confidence, merchantName: null, ownerUserId: null, needsReview: true,
  });

  // Pagamentos de fatura não são gastos.
  if (input.kind === "pagamento") {
    return { categoryId: null, source: "none", confidence: "alta", merchantName: null, ownerUserId: null, needsReview: false };
  }

  // 1) Regras do casal
  const rules = [...(ctx.rules ?? [])].sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100) || b.pattern.length - a.pattern.length,
  );
  let owner: string | null = null;
  for (const r of rules) {
    if (keys.some((k) => patternMatches(k, r.pattern, r.matchType))) {
      owner = r.ownerUserId ?? null;
      if (r.categoryId !== null) {
        return { categoryId: r.categoryId, source: "rule", confidence: "alta", merchantName: null, ownerUserId: owner, needsReview: false };
      }
    }
  }

  // 2) Dicionário de estabelecimentos: do casal e depois global; padrões mais longos primeiro.
  const pools: (readonly Merchant[])[] = [ctx.householdMerchants ?? [], ctx.globalMerchants ?? SEED_MERCHANTS];
  for (const pool of pools) {
    const sorted = [...pool].sort((a, b) => b.pattern.length - a.pattern.length);
    for (const merchant of sorted) {
      if (keys.some((k) => patternMatches(k, merchant.pattern, merchant.matchType))) {
        // "IFD*" genérico só vale se não houver vendedor mais específico; ele já é o último por tamanho.
        return {
          categoryId: merchant.categoryId,
          source: "merchant",
          confidence: merchant.confidence,
          merchantName: merchant.realName,
          ownerUserId: owner,
          needsReview: merchant.confidence === "baixa",
        };
      }
    }
  }

  // 3) Encargos conhecidos
  if (input.kind === "encargo" || KIND_ENCARGO.test(decoded.key)) {
    return { categoryId: CAT.SERVICOS, source: "heuristic", confidence: "alta", merchantName: null, ownerUserId: owner, needsReview: false };
  }

  // 4) Heurísticas por palavra no nome do vendedor
  for (const h of HEURISTICS) {
    if (h.re.test(decoded.vendorKey)) {
      return { categoryId: h.categoryId, source: "heuristic", confidence: "media", merchantName: null, ownerUserId: owner, needsReview: false };
    }
  }

  // 5) Sem pista → fila "Revisar"
  return { ...none(), ownerUserId: owner };
}

export const SEED_MERCHANTS: readonly Merchant[] = MERCHANT_SEEDS.map((s: MerchantSeed) => ({
  pattern: s.pattern,
  matchType: s.matchType,
  realName: s.realName,
  segment: s.segment ?? null,
  categoryId: s.categoryId,
  confidence: s.confidence,
}));

/**
 * Cria uma regra a partir de uma correção manual: a chave do estabelecimento
 * (sem número de loja) vira padrão "contém", valendo para os dois.
 */
export function ruleFromCorrection(description: string, categoryId: number, ownerUserId: string | null = null): Rule {
  const decoded = decodeDescription(description);
  const base = (decoded.processor ? decoded.vendorKey : decoded.key).replace(/\s+\d{2,}$/g, "").trim();
  return { pattern: base || decoded.key, matchType: "contains", categoryId, ownerUserId, priority: 100 };
}

/** A regra casa com esta descrição? (considera também o vendedor atrás de IFD*, MP*, ZP*…) */
export function ruleMatchesDescription(rule: Pick<Rule, "pattern" | "matchType">, description: string): boolean {
  const d = decodeDescription(description);
  const keys = d.processor ? [d.key, d.vendorKey] : [d.key];
  return keys.some((k) => patternMatches(k, rule.pattern, rule.matchType));
}

export const MATCH_TYPE_LABEL: Record<MatchType, string> = { contains: "contém", prefix: "começa com", regex: "expressão" };

/** Valida um padrão digitado pela pessoa (regex quebrada não pode entrar). */
export function validateRulePattern(pattern: string, matchType: MatchType): string | null {
  const p = pattern.trim();
  if (p.length < 2) return "O padrão precisa ter pelo menos 2 caracteres.";
  if (p.length > 80) return "O padrão é longo demais (máximo 80).";
  if (matchType === "regex") {
    try {
      new RegExp(p, "i");
    } catch {
      return "Expressão inválida.";
    }
  }
  return null;
}
