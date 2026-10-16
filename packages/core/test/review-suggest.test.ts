import { describe, expect, it } from "vitest";
import { CAT } from "../src/categories.ts";
import { ruleFromCorrection } from "../src/categorize.ts";
import { merchantHistory, suggestReviewCategory } from "../src/review-suggest.ts";

describe("sugestão da revisão por cartões", () => {
  it("regra do casal vence tudo", () => {
    const rules = [ruleFromCorrection("PADARIA DO ZE 123", CAT.MERCADO)];
    const history = merchantHistory([{ description: "PADARIA DO ZE 123", categoryId: CAT.RESTAURANTE }]);
    expect(suggestReviewCategory({ description: "PADARIA DO ZE 456", categoryId: CAT.OUTROS }, { rules, history, top: [CAT.LAZER] }))
      .toEqual({ categoryId: CAT.MERCADO, source: "regra" });
  });

  it("usa o que o casal já escolheu para o mesmo estabelecimento (maioria)", () => {
    const history = merchantHistory([
      { description: "LOJA XPTO 0001", categoryId: CAT.COMPRAS },
      { description: "LOJA XPTO 0002", categoryId: CAT.COMPRAS },
      { description: "LOJA XPTO", categoryId: CAT.CASA },
      { description: "LOJA XPTO", categoryId: CAT.OUTROS },
      { description: "LOJA XPTO", categoryId: null },
    ]);
    expect(suggestReviewCategory({ description: "LOJA XPTO 0099" }, { history })).toEqual({ categoryId: CAT.COMPRAS, source: "historico" });
  });

  it("empate no histórico escolhe o menor id", () => {
    const history = merchantHistory([
      { description: "ABC", categoryId: CAT.CASA },
      { description: "ABC", categoryId: CAT.MERCADO },
    ]);
    expect(suggestReviewCategory({ description: "ABC" }, { history })?.categoryId).toBe(CAT.MERCADO);
  });

  it("categoria atual (dicionário, confiança baixa) quando não há histórico", () => {
    expect(suggestReviewCategory({ description: "QQ COISA", categoryId: CAT.SAUDE }, { top: [CAT.LAZER] })).toEqual({ categoryId: CAT.SAUDE, source: "dicionario" });
  });

  it("recorre ao dicionário/heurística e depois à mais usada", () => {
    expect(suggestReviewCategory({ description: "NETFLIX.COM", categoryId: CAT.OUTROS })).toEqual({ categoryId: CAT.ASSINATURAS, source: "dicionario" });
    expect(suggestReviewCategory({ description: "ZZZ DESCONHECIDO", categoryId: CAT.OUTROS }, { top: [CAT.OUTROS, CAT.LAZER] })).toEqual({ categoryId: CAT.LAZER, source: "frequente" });
  });

  it("sem pista nenhuma → null; nunca sugere Outros nem pagamento", () => {
    expect(suggestReviewCategory({ description: "ZZZ DESCONHECIDO" })).toBeNull();
    expect(suggestReviewCategory({ description: "ZZZ", categoryId: CAT.OUTROS }, { top: [CAT.OUTROS] })).toBeNull();
    expect(suggestReviewCategory({ description: "PAGAMENTO", kind: "pagamento" }, { top: [CAT.LAZER] })).toBeNull();
  });
});
