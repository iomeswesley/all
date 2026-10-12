// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { parseJsonImport } from "./json-import.ts";
import { decodeOfxBytes, parseOfx, type OfxOptions } from "./ofx.ts";
import { isSantanderStatement, parseSantanderStatement } from "./santander/index.ts";
import { StatementParseError, type ParsedStatement, type PdfTextItem } from "./types.ts";

/** O que o app envia para ser lido. */
export type ImportSource =
  | { format: "pdf"; items: PdfTextItem[] }
  | { format: "ofx"; text: string; options?: OfxOptions }
  | { format: "json"; text: string };

export type FileFormat = "pdf" | "ofx" | "json";

export function detectFormatFromName(name: string): FileFormat | null {
  const ext = name.toLowerCase().split(".").pop();
  return ext === "pdf" ? "pdf" : ext === "ofx" || ext === "qfx" ? "ofx" : ext === "json" || ext === "txt" ? "json" : null;
}

export interface BankParser {
  id: string;
  label: string;
  detect(items: readonly PdfTextItem[]): boolean;
  parse(items: readonly PdfTextItem[]): ParsedStatement;
}

/**
 * Leitores de PDF por banco. Para suportar outro banco: escreva um leitor (ver parsers/santander) e
 * registre aqui. Enquanto isso, qualquer banco funciona por OFX ou JSON assistido.
 */
export const PDF_PARSERS: readonly BankParser[] = [{ id: "santander", label: "Santander", detect: isSantanderStatement, parse: parseSantanderStatement }];

export const OTHER_BANK_HINT = "Para outros bancos, use o arquivo OFX (muitos bancos oferecem) ou a importação assistida por JSON.";

export function parseImport(source: ImportSource): ParsedStatement {
  switch (source.format) {
    case "pdf": {
      const parser = PDF_PARSERS.find((p) => p.detect(source.items));
      if (!parser) throw new StatementParseError(`Não reconheci este PDF (só faturas ${PDF_PARSERS.map((p) => p.label).join(", ")}). ${OTHER_BANK_HINT}`);
      return parser.parse(source.items);
    }
    case "ofx":
      return parseOfx(source.text, source.options);
    case "json":
      return parseJsonImport(source.text);
  }
}

export { decodeOfxBytes };
