import { describe, expect, it } from "vitest";
import { CAT } from "../src/categories.ts";
import { categorize, ruleFromCorrection, type Merchant, type Rule } from "../src/categorize.ts";
import { decodeDescription, matchKey, merchantKey } from "../src/normalize.ts";

describe("normalização", () => {
  it("matchKey", () => {
    expect(matchKey("  Açaí  da  Praça ")).toBe("ACAI DA PRACA");
    expect(matchKey("IFD *Maria")).toBe("IFD*MARIA");
    expect(matchKey("UBER * PENDING")).toBe("UBER*PENDING");
  });
  it("decodifica prefixos de intermediários", () => {
    expect(decodeDescription("IFD*MARIA IZABEL NUNES DA").display).toBe("iFood · Maria Izabel Nunes da");
    expect(decodeDescription("MP *Q2INGRESSOS").display).toBe("Q2INGRESSOS (Mercado Pago)");
    expect(decodeDescription("ZP *BARBEARIA HANOFF").display).toBe("Barbearia Hanoff (Zoop)");
    expect(decodeDescription("CAPPTA *CELEIRO BAR E").display).toBe("Celeiro Bar e (Cappta)");
    expect(decodeDescription("DIVINA GULA PAES E D").display).toBe("Divina Gula Paes e D");
    expect(decodeDescription("IFD*MARIA").processor?.name).toBe("iFood");
  });
  it("merchantKey remove número de loja e sufixos", () => {
    expect(merchantKey("SAMS JOINVILLE AM 4672")).toBe("SAMS JOINVILLE AM");
    expect(merchantKey("UBER * PENDING")).toBe("UBER");
    expect(merchantKey("ANTHROPIC* CLAUDE SUB")).toBe("ANTHROPIC CLAUDE SUB");
  });
});

describe("categorização em camadas", () => {
  const cat = (description: string, ctx = {}) => categorize({ description, kind: "avista" }, ctx);

  it("dicionário global: alta confiança", () => {
    const r = cat("GIASSI SUPERMERCADOS");
    expect(r).toMatchObject({ categoryId: CAT.MERCADO, source: "merchant", confidence: "alta", merchantName: "Giassi", needsReview: false });
  });
  it("iFood vai para restaurante/delivery com confiança média", () => {
    expect(cat("IFD*KYRAS SUSHI RESTAURAN")).toMatchObject({ categoryId: CAT.RESTAURANTE, confidence: "media" });
  });
  it("Uber é transporte; Anthropic é assinatura", () => {
    expect(cat("UBER * PENDING").categoryId).toBe(CAT.TRANSPORTE);
    expect(cat("ANTHROPIC* CLAUDE SUB").categoryId).toBe(CAT.ASSINATURAS);
  });
  it("regex para Raia com número de loja", () => {
    expect(cat("RAIA4431").categoryId).toBe(CAT.SAUDE);
  });
  it("heurística por palavra quando não está no dicionário", () => {
    expect(cat("AUTOPOSTOYAS")).toMatchObject({ categoryId: CAT.TRANSPORTE, source: "heuristic", confidence: "media" });
    expect(cat("PADARIA BOM PAO")).toMatchObject({ categoryId: CAT.RESTAURANTE, source: "heuristic" });
    expect(cat("CAPPTA *CASA AMARELA RESTAURANTE").categoryId).toBe(CAT.RESTAURANTE);
  });
  it("sem pista → Outros com confiança baixa e fila Revisar", () => {
    expect(cat("ARLETE SCHLICKMANN")).toMatchObject({ categoryId: CAT.OUTROS, source: "none", confidence: "baixa", needsReview: true });
    expect(cat("MP *XPTO")).toMatchObject({ needsReview: true });
  });
  it("regra do casal vence o dicionário", () => {
    const rules: Rule[] = [{ pattern: "GIASSI", matchType: "contains", categoryId: CAT.CASA }];
    expect(cat("GIASSI SUPERMERCADOS", { rules })).toMatchObject({ categoryId: CAT.CASA, source: "rule", confidence: "alta" });
  });
  it("dicionário do casal vence o global", () => {
    const householdMerchants: Merchant[] = [{ pattern: "GIASSI", matchType: "contains", realName: "Giassi", categoryId: CAT.CASA, confidence: "alta" }];
    expect(cat("GIASSI SUPERMERCADOS", { householdMerchants }).categoryId).toBe(CAT.CASA);
  });
  it("regra pode fixar o dono", () => {
    const rules: Rule[] = [{ pattern: "BARBEARIA HANOFF", matchType: "contains", categoryId: CAT.SERVICOS, ownerUserId: "u1" }];
    expect(cat("ZP *BARBEARIA HANOFF", { rules })).toMatchObject({ categoryId: CAT.SERVICOS, ownerUserId: "u1" });
  });
  it("regra mais específica (prioridade/tamanho) vence", () => {
    const rules: Rule[] = [
      { pattern: "MP", matchType: "prefix", categoryId: CAT.OUTROS, priority: 100 },
      { pattern: "Q2INGRESSOS", matchType: "contains", categoryId: CAT.LAZER, priority: 100 },
    ];
    expect(cat("MP *Q2INGRESSOS", { rules }).categoryId).toBe(CAT.LAZER);
  });
  it("pagamento de fatura não tem categoria; encargos são Serviços/tarifas", () => {
    expect(categorize({ description: "PAGAMENTO DE FATURA-INTERNET", kind: "pagamento" }).categoryId).toBeNull();
    expect(categorize({ description: "IOF DESPESA NO EXTERIOR", kind: "encargo" }).categoryId).toBe(CAT.SERVICOS);
    expect(categorize({ description: "ANUIDADE DIFERENCIADA", kind: "encargo" }).categoryId).toBe(CAT.SERVICOS);
  });
  it("correção manual vira regra que vale para o próximo mês", () => {
    const rule = ruleFromCorrection("SAMS JOINVILLE AM 4672", CAT.CASA);
    expect(rule).toMatchObject({ pattern: "SAMS JOINVILLE AM", categoryId: CAT.CASA });
    expect(cat("SAMS JOINVILLE AM 9999", { rules: [rule] })).toMatchObject({ categoryId: CAT.CASA, source: "rule" });
    const viaPix = ruleFromCorrection("MP *Q2INGRESSOS", CAT.LAZER);
    expect(viaPix.pattern).toBe("Q2INGRESSOS");
  });
});
