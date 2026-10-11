#!/usr/bin/env node
// Anonimiza itens de texto de faturas Santander para uso como fixture pública.
//
// Remove: nome, endereço, CEP, código de barras, finais de cartão e nomes de
// estabelecimentos (trocados por "<RAMO> NNN", ex. RESTAURANTE 007 ou ESTAB 021,
// de forma consistente entre meses, preservando prefixos como IFD*, MP*, ZP*, CAPPTA*
// e a categoria que o nome original receberia).
// Mantém: datas, valores, parcelas e a estrutura do PDF — o que os testes precisam.
//
// Uso: ANON_TERMS_FILE=termos.json node scripts/anonymize-statement.mjs <saida_dir> <items1.json> [items2.json ...]
//      (termos.json fica FORA do repositório; formato descrito mais abaixo)
//      (os arquivos são processados em ordem alfabética, para numeração estável)
import fs from "node:fs";
import path from "node:path";
import { categorize } from "../packages/core/src/categorize.ts";

const [, , outDir, ...inputs] = process.argv;
if (!outDir || inputs.length === 0) {
  console.error("uso: node scripts/anonymize-statement.mjs <saida_dir> <items.json>...");
  process.exit(1);
}

/** Marcas públicas que podem ficar (úteis para testar o dicionário de categorias). */
const KEEP = [
  "ANTHROPIC", "UBER", "ALIEXPRESS", "BOOKING", "SHOPEE", "MERCADOLIVRE", "HAVAN", "GIASSI",
  "FORT ATACADISTA", "MC DONALDS", "KFC", "SAMS", "PANVEL", "DECATHLON", "OUTBACK", "POSTO",
];
const FIXED = /^(PAGAMENTO DE FATURA|ANUIDADE)/;
const PREFIX = /^((?:IFD|MP|ZP|CAPPTA|PG|PAG|S2P|SUMUP|STONE|SHOPEE)\s*\*\s*)/i;

/** Palavra sintética que faz o categorizador chegar à mesma categoria do nome original. */
const WORD_BY_CATEGORY = { 1: "MERCADO", 2: "RESTAURANTE", 3: "POSTO", 5: "FARMACIA", 6: "MOVEIS", 7: "LOJA", 8: "INGRESSOS", 9: "ESCOLA", 10: "HOTEL", 11: "BARBEARIA" };
const names = new Map(); // descrição original → pseudônimo
const pseudo = (orig) => {
  if (!names.has(orig)) names.set(orig, String(names.size + 1).padStart(3, "0"));
  return names.get(orig);
};

function anonymizeDescription(desc) {
  const clean = desc.replace(/JOINVILLE/gi, "CIDADE");
  if (FIXED.test(clean)) return clean;
  if (/^(COTA|IOF)/i.test(clean)) return clean;
  const upper = clean.toUpperCase();
  const keep = KEEP.find((k) => upper.startsWith(k));
  if (keep) return clean;
  const m = PREFIX.exec(clean);
  const prefix = m ? m[1].replace(/\s+/g, " ") : "";
  const rest = m ? clean.slice(m[0].length) : clean;
  const cat = categorize({ description: clean, kind: "avista" });
  const word = !cat.needsReview && cat.categoryId ? WORD_BY_CATEGORY[cat.categoryId] : undefined;
  return `${prefix}${word ?? "ESTAB"} ${pseudo(rest)}`;
}

/**
 * Dados pessoais a remover vêm de um arquivo LOCAL (nunca commitado), apontado por ANON_TERMS_FILE:
 *   { "names": ["NOME COMPLETO", "Primeiro nome"], "address": ["RUA X 123", "BAIRRO"],
 *     "cardLast4": ["1234", "5678"], "cardBin": ["1234"] }
 * Além disso, CEPs e sequências longas de dígitos (código de barras) são sempre removidos.
 */
const terms = process.env.ANON_TERMS_FILE ? JSON.parse(fs.readFileSync(process.env.ANON_TERMS_FILE, "utf8")) : {};
const escape = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const replacers = [
  ...(terms.names ?? []).map((n) => [new RegExp(escape(n), "gi"), "TITULAR EXEMPLO"]),
  ...(terms.address ?? []).map((a) => [new RegExp(escape(a), "gi"), "ENDERECO EXEMPLO"]),
  ...(terms.cardBin ?? []).map((b) => [new RegExp(`\\b${escape(b)}\\b`, "g"), "0000"]),
  ...(terms.cardLast4 ?? []).map((c, i) => [new RegExp(`\\b${escape(c)}\\b`, "g"), String(i + 1).repeat(4)]),
];

function anonymizeText(s) {
  let out = s.replace(/\b\d{5}-\d{3}\b/g, "00000-000").replace(/\b\d{14,}\b/g, (d) => "0".repeat(d.length));
  for (const [re, to] of replacers) out = out.replace(re, to);
  return out;
}

fs.mkdirSync(outDir, { recursive: true });
for (const file of [...inputs].sort()) {
  const items = JSON.parse(fs.readFileSync(file, "utf8")).map((it) => {
    let s = anonymizeText(it.s);
    const m = /^(\d{2}\/\d{2}) (.+)$/.exec(s);
    if (m && it.p >= 2) s = `${m[1]} ${anonymizeDescription(m[2])}`;
    return { ...it, s };
  });
  const out = path.join(outDir, path.basename(file));
  fs.writeFileSync(out, JSON.stringify(items));
  console.log(`${path.basename(file)} → ${out} (${items.length} itens)`);
}
