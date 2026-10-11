import type { PdfTextItem } from "../parsers/types.ts";

/** Subconjunto da API do PDF.js que usamos (injetado, para o core não depender dele). */
export interface PdfDocumentLike {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: readonly unknown[] }>;
  }>;
}

interface RawTextItem {
  str?: string;
  transform?: number[];
  width?: number;
}

/** Converte um documento PDF.js em itens de texto com posição. */
export async function itemsFromPdfDocument(doc: PdfDocumentLike): Promise<PdfTextItem[]> {
  const out: PdfTextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const raw of content.items as RawTextItem[]) {
      if (typeof raw.str !== "string" || !raw.str.trim() || !raw.transform) continue;
      out.push({
        p,
        x: Math.round(raw.transform[4]! * 10) / 10,
        y: Math.round(raw.transform[5]! * 10) / 10,
        w: Math.round((raw.width ?? 0) * 10) / 10,
        s: raw.str,
      });
    }
  }
  return out;
}
