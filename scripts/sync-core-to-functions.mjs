#!/usr/bin/env node
// Copia packages/core/src para supabase/functions/_shared/core.
// O `supabase functions deploy` empacota só a pasta supabase/functions, então a Edge Function
// importa o core daqui. Um teste garante que a cópia não fique desatualizada.
// Uso: node scripts/sync-core-to-functions.mjs [--check]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "packages/core/src");
const dst = path.join(root, "supabase/functions/_shared/core");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const BANNER = "// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.\n";
const expected = new Map(walk(src).map((f) => [path.relative(src, f), BANNER + fs.readFileSync(f, "utf8")]));

if (process.argv.includes("--check")) {
  const have = fs.existsSync(dst) ? walk(dst).map((f) => path.relative(dst, f)) : [];
  const problems = [
    ...[...expected.keys()].filter((k) => !have.includes(k)).map((k) => `faltando: ${k}`),
    ...have.filter((k) => !expected.has(k)).map((k) => `sobrando: ${k}`),
    ...[...expected].filter(([k, v]) => have.includes(k) && fs.readFileSync(path.join(dst, k), "utf8") !== v).map(([k]) => `desatualizado: ${k}`),
  ];
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("cópia do core em sincronia");
} else {
  fs.rmSync(dst, { recursive: true, force: true });
  for (const [rel, content] of expected) {
    const out = path.join(dst, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content);
  }
  console.log(`${expected.size} arquivos copiados para ${path.relative(root, dst)}`);
}
