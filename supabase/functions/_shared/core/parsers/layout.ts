// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import type { PdfTextItem } from "./types.ts";

export interface Row {
  y: number;
  items: PdfTextItem[];
  /** textos concatenados, em ordem de x */
  text: string;
}

/** Agrupa itens em linhas pela coordenada y (tolerância em pontos). */
export function toRows(items: readonly PdfTextItem[], tolerance = 3.2): Row[] {
  const rows: { y: number; items: PdfTextItem[] }[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= tolerance);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows.map((r) => {
    const sorted = r.items.sort((a, b) => a.x - b.x);
    return { y: r.y, items: sorted, text: sorted.map((i) => i.s.trim()).join(" ").replace(/\s+/g, " ").trim() };
  });
}

/**
 * Ordem de leitura de uma página em duas colunas: coluna esquerda inteira
 * (de cima para baixo) e depois a direita.
 */
export function readingOrder(items: readonly PdfTextItem[], page: number, columnBoundaryX = 298): { row: Row; column: 0 | 1 }[] {
  const onPage = items.filter((i) => i.p === page);
  const left = toRows(onPage.filter((i) => i.x < columnBoundaryX));
  const right = toRows(onPage.filter((i) => i.x >= columnBoundaryX));
  return [...left.map((row) => ({ row, column: 0 as const })), ...right.map((row) => ({ row, column: 1 as const }))];
}

export function pagesOf(items: readonly PdfTextItem[]): number[] {
  return [...new Set(items.map((i) => i.p))].sort((a, b) => a - b);
}
