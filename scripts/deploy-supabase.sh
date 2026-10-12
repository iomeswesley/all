#!/usr/bin/env bash
# Aplica TUDO no seu projeto Supabase: tabelas/regras (migrations) e as funções.
# Uso: scripts/deploy-supabase.sh <project-ref>      (o "xxxx" de https://xxxx.supabase.co)
# Antes: `npx supabase login` (abre o navegador uma vez).
set -euo pipefail
REF="${1:-${SUPABASE_PROJECT_REF:-}}"
if [ -z "$REF" ]; then
  echo "uso: scripts/deploy-supabase.sh <project-ref>" >&2
  exit 1
fi
cd "$(dirname "$0")/.."

echo "→ copiando o código compartilhado para as funções"
node scripts/sync-core-to-functions.mjs

echo "→ ligando ao projeto $REF"
npx supabase link --project-ref "$REF"

echo "→ aplicando as migrations (tabelas, RLS, funções SQL, buckets)"
npx supabase db push

for fn in parse-statement notify delete-account; do
  echo "→ publicando a função $fn"
  npx supabase functions deploy "$fn" --project-ref "$REF"
done

echo "✓ pronto. Falta só configurar o e-mail do login (docs/SETUP.md, passo 3) e o apps/mobile/.env."
