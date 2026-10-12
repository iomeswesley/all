// Teste OPCIONAL com faturas reais (PDF). Nunca commite PDFs: fixtures/private/ e *.pdf estão no .gitignore.
//   FATURAS_DIR=/caminho/com/pdfs pnpm --filter @financas/core test private-pdfs
// ou coloque os PDFs em fixtures/private/. Sem PDFs, o teste é ignorado.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDocumentProxy } from "unpdf";
import { buildDraft } from "../src/draft.ts";
import { itemsFromPdfDocument } from "../src/pdf/items.ts";
import { parseSantanderStatement } from "../src/parsers/santander/index.ts";

const dir = process.env.FATURAS_DIR ?? path.resolve(import.meta.dirname, "../../../fixtures/private");
const pdfs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort() : [];

describe.skipIf(pdfs.length === 0)("faturas reais (PDF → conferência)", () => {
  it.each(pdfs)("%s: soma = total e parcelas futuras = obrigações futuras", async (file) => {
    const doc = await getDocumentProxy(new Uint8Array(fs.readFileSync(path.join(dir, file))));
    const parsed = parseSantanderStatement(await itemsFromPdfDocument(doc));
    const draft = buildDraft(parsed, { accountId: "teste" });
    const byId = Object.fromEntries(draft.reconcile.checks.map((c) => [c.id, c]));
    expect(parsed.warnings).toEqual([]);
    expect(byId.total!.diffCents, "total").toBe(0);
    expect(byId.expenses!.diffCents, "despesas").toBe(0);
    expect(byId.payments!.diffCents, "pagamentos").toBe(0);
    expect(byId.credits!.diffCents, "créditos").toBe(0);
    expect(draft.reconcile.canAutoConfirm).toBe(true);
    expect(Math.abs(byId.future_obligations!.diffCents)).toBeLessThanOrEqual(40);
  });
});
