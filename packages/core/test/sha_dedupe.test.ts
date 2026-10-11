import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assignDedupeHashes } from "../src/dedupe.ts";
import { sha256Hex } from "../src/sha256.ts";

describe("sha256", () => {
  it.each(["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(1000), "ação ✓ 日本"])("igual ao node:crypto (%#)", (s) => {
    expect(sha256Hex(s)).toBe(createHash("sha256").update(s).digest("hex"));
  });
});

describe("dedupe", () => {
  const base = { postedOn: "2026-08-10", descriptionRaw: "UBER * PENDING", amountCents: 2743, installmentN: null, installmentTotal: null, cardLast4: "2222", kind: "avista" };
  it("compras idênticas no mesmo dia recebem ordinais diferentes", () => {
    const [a, b] = assignDedupeHashes("acc", [base, { ...base }]);
    expect(a!.dedupeHash).not.toBe(b!.dedupeHash);
  });
  it("é idempotente: reimportar gera os mesmos hashes", () => {
    const first = assignDedupeHashes("acc", [base, { ...base }]).map((t) => t.dedupeHash);
    const again = assignDedupeHashes("acc", [base, { ...base }]).map((t) => t.dedupeHash);
    expect(again).toEqual(first);
  });
  it("número de loja e caixa não mudam a identidade", () => {
    const [a] = assignDedupeHashes("acc", [{ ...base, descriptionRaw: "SAMS JOINVILLE AM 4672" }]);
    const [b] = assignDedupeHashes("acc", [{ ...base, descriptionRaw: "Sams Joinville Am 9999" }]);
    expect(a!.dedupeHash).toBe(b!.dedupeHash);
  });
  it("parcelas diferentes da mesma compra têm hashes diferentes", () => {
    const p = { ...base, descriptionRaw: "HOSAG", amountCents: 62333, installmentTotal: 6, kind: "parcela" };
    const [a] = assignDedupeHashes("acc", [{ ...p, installmentN: 3 }]);
    const [b] = assignDedupeHashes("acc", [{ ...p, installmentN: 4 }]);
    expect(a!.dedupeHash).not.toBe(b!.dedupeHash);
  });
  it("contas diferentes têm hashes diferentes", () => {
    expect(assignDedupeHashes("a", [base])[0]!.dedupeHash).not.toBe(assignDedupeHashes("b", [base])[0]!.dedupeHash);
  });
});
