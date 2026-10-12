#!/usr/bin/env node
// Garante contraste WCAG AA (≥ 4,5:1) dos textos e botões do app, nos temas claro e escuro.
// Lê os tokens de apps/mobile/src/lib/theme.ts. Roda em `pnpm test`.
import fs from "node:fs";

const src = fs.readFileSync(new URL("../apps/mobile/src/lib/theme.ts", import.meta.url), "utf8");
const tokens = (name) => {
  const m = new RegExp(`const ${name}: Theme = \\{([\\s\\S]*?)\\n\\};`).exec(src);
  if (!m) throw new Error(`tema ${name} não encontrado`);
  return Object.fromEntries([...m[1].matchAll(/(\w+): "(#[0-9a-fA-F]{6})"/g)].map((x) => [x[1], x[2]]));
};
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const failures = [];
for (const theme of ["light", "dark"]) {
  const t = tokens(theme);
  const pairs = [
    ...["text", "textSecondary", "textMuted", "primary", "danger", "warning", "success"].flatMap((fg) => ["bg", "surface"].map((bg) => [fg, bg])),
    ["onPrimary", "primaryFill"],
    ["onPrimary", "dangerFill"],
  ];
  for (const [fg, bg] of pairs) {
    const r = ratio(t[fg], t[bg]);
    if (r < 4.5) failures.push(`${theme}: ${fg} (${t[fg]}) sobre ${bg} (${t[bg]}) = ${r.toFixed(2)}:1`);
  }
}
if (failures.length) {
  console.error("Contraste abaixo de 4,5:1:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("contraste AA ok (claro e escuro)");
