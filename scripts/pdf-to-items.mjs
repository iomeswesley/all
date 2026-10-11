#!/usr/bin/env node
// Extrai os itens de texto (com posição) de um PDF — o mesmo caminho usado pela Edge Function.
// Uso: node scripts/pdf-to-items.mjs fatura.pdf [saida.json]
import fs from "node:fs";
import { getDocumentProxy } from "unpdf";
import { itemsFromPdfDocument } from "../packages/core/src/pdf/items.ts";

const [, , input, output] = process.argv;
if (!input) {
  console.error("uso: node scripts/pdf-to-items.mjs fatura.pdf [saida.json]");
  process.exit(1);
}
const doc = await getDocumentProxy(new Uint8Array(fs.readFileSync(input)));
const items = await itemsFromPdfDocument(doc);
const json = JSON.stringify(items);
if (output) fs.writeFileSync(output, json);
else process.stdout.write(json);
