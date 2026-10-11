#!/usr/bin/env node
// Gera supabase/migrations/20261011000005_seed_merchants.sql a partir do dicionário do core
// (packages/core/src/seeds/merchants.ts). Rode `node scripts/gen-seed-sql.mjs` após editar o seed.
// Um teste garante que o arquivo commitado está sincronizado.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MERCHANT_SEEDS } from "../packages/core/src/seeds/merchants.ts";

export function buildSeedSql() {
  const q = (s) => (s == null ? "null" : `$q$${s}$q$`);
  const rows = MERCHANT_SEEDS.map(
    (m) => `  (null, ${q(m.pattern)}, '${m.matchType}', ${q(m.realName)}, ${q(m.segment ?? null)}, ${m.categoryId}, '${m.confidence}')`,
  );
  return `-- GERADO por scripts/gen-seed-sql.mjs a partir de packages/core/src/seeds/merchants.ts. Não edite à mão.
insert into public.merchants (household_id, pattern, match_type, real_name, segment, category_id, confidence) values
${rows.join(",\n")}
on conflict do nothing;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../supabase/migrations/20261011000005_seed_merchants.sql");
  fs.writeFileSync(out, buildSeedSql());
  console.log(`escrito ${out} (${MERCHANT_SEEDS.length} estabelecimentos)`);
}
