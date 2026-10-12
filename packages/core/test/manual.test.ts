import { describe, expect, it } from "vitest";
import { CAT } from "../src/categories.ts";
import { MATCH_TYPE_LABEL, ruleMatchesDescription, validateRulePattern } from "../src/categorize.ts";
import { buildManualRow, parseEntryDate, validateManualEntry, type ManualEntryInput } from "../src/manual.ts";
import { CATEGORIZE_ACTIONS_ID, manualEntryMessage } from "../src/notifications.ts";

const base: ManualEntryInput = { description: "Diarista", amountCents: 18000, date: "2026-10-10", method: "pix", categoryId: null, ownerUserId: null, isPrivate: false };

describe("lançamento rápido (Pix, dinheiro…)", () => {
  it("valida valor, descrição e data", () => {
    expect(validateManualEntry(base, "2026-10-12")).toBeNull();
    expect(validateManualEntry({ ...base, amountCents: 0 }, "2026-10-12")).toMatch(/maior que zero/);
    expect(validateManualEntry({ ...base, amountCents: 10.5 }, "2026-10-12")).toMatch(/maior que zero/);
    expect(validateManualEntry({ ...base, description: " a " }, "2026-10-12")).toMatch(/Descreva/);
    expect(validateManualEntry({ ...base, date: "2026-10-20" }, "2026-10-12")).toMatch(/futuro/);
    expect(validateManualEntry({ ...base, date: "2025-01-01" }, "2026-10-12")).toMatch(/antiga/);
    expect(validateManualEntry({ ...base, isPrivate: true }, "2026-10-12")).toMatch(/dono/);
    expect(validateManualEntry({ ...base, amountCents: 100_000_001 }, "2026-10-12")).toMatch(/alto/);
  });

  it("sem categoria escolhida cai em Revisar; com categoria vale como manual", () => {
    const r = buildManualRow(base, "n1");
    expect(r).toMatchObject({ description_raw: "PIX DIARISTA", description_clean: "Pix · Diarista", amount_cents: 18000, kind: "avista", source: "manual", needs_review: true, category_id: CAT.OUTROS });
    const c = buildManualRow({ ...base, categoryId: CAT.CASA }, "n1");
    expect(c).toMatchObject({ category_id: CAT.CASA, category_source: "manual", confidence: "alta", needs_review: false });
  });

  it("as regras do casal categorizam o Pix sozinhas", () => {
    const ctx = { rules: [{ pattern: "DIARISTA", matchType: "contains" as const, categoryId: CAT.CASA, ownerUserId: "ana" }] };
    const r = buildManualRow(base, "n", ctx);
    expect(r).toMatchObject({ category_id: CAT.CASA, category_source: "rule", needs_review: false, owner_user_id: "ana" });
  });

  it("gasto pessoal fica com o dono; hash muda com o nonce (duas iguais no dia são legítimas)", () => {
    const p = buildManualRow({ ...base, isPrivate: true, ownerUserId: "ana" }, "a");
    expect(p).toMatchObject({ is_private: true, owner_user_id: "ana" });
    expect(buildManualRow(base, "a").dedupe_hash).not.toBe(buildManualRow(base, "b").dedupe_hash);
    expect(buildManualRow(base, "a").dedupe_hash).toBe(buildManualRow(base, "a").dedupe_hash);
  });

  it("datas digitadas", () => {
    expect(parseEntryDate("", "2026-10-12")).toBe("2026-10-12");
    expect(parseEntryDate("ontem", "2026-10-12")).toBe("2026-10-11");
    expect(parseEntryDate("05/10", "2026-10-12")).toBe("2026-10-05");
    expect(parseEntryDate("05/10/2026", "2026-10-12")).toBe("2026-10-05");
    expect(parseEntryDate("31/02", "2026-10-12")).toBeNull();
    expect(parseEntryDate("abc", "2026-10-12")).toBeNull();
  });

  it("push ao par com botões de categoria quando falta classificar", () => {
    const m = manualEntryMessage({ byName: "Ana", amountCents: 18000, description: "Pix · Diarista", categoryId: 12, needsReview: true, month: "2026-10", txId: "t1" });
    expect(m).toMatchObject({ title: "Ana lançou R$ 180,00", categoryIdentifier: CATEGORIZE_ACTIONS_ID, data: { type: "manual", route: "/revisar", txId: "t1" } });
    const done = manualEntryMessage({ byName: "Ana", amountCents: 18000, description: "Pix · Diarista", categoryId: 6, needsReview: false, month: "2026-10", txId: "t1" });
    expect(done.categoryIdentifier).toBeUndefined();
    expect(done.body).toContain("Casa");
  });
});

describe("regras: casar e validar", () => {
  it("casa pelo vendedor atrás do intermediário", () => {
    expect(ruleMatchesDescription({ pattern: "Q2INGRESSOS", matchType: "contains" }, "MP *Q2INGRESSOS")).toBe(true);
    expect(ruleMatchesDescription({ pattern: "MP*", matchType: "prefix" }, "MP *Q2INGRESSOS")).toBe(true);
    expect(ruleMatchesDescription({ pattern: "^RAIA\\d+$", matchType: "regex" }, "RAIA4431")).toBe(true);
    expect(ruleMatchesDescription({ pattern: "PADARIA", matchType: "contains" }, "MERCADO IGUACU")).toBe(false);
  });
  it("valida padrão digitado", () => {
    expect(validateRulePattern("a", "contains")).toMatch(/2 caracteres/);
    expect(validateRulePattern("(a", "regex")).toMatch(/inválida/);
    expect(validateRulePattern("padaria", "contains")).toBeNull();
    expect(validateRulePattern("x".repeat(81), "contains")).toMatch(/longo/);
    expect(MATCH_TYPE_LABEL.prefix).toBe("começa com");
  });
});
