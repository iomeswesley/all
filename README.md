# Finanças do Casal

App mobile (Expo/React Native) de controle financeiro para um casal, em pt-BR. Importa a **fatura do cartão Santander em PDF**, **confere se a soma bate com o total**, categoriza (dicionário → regras do casal → fila "Revisar"), e mostra dashboard, parcelas futuras e recorrências. Sem Open Finance e sem IA: leitura determinística, privada e sem custo por uso.

- Guia de instalação: [docs/SETUP.md](docs/SETUP.md)
- Planejamento e decisões: [docs/PLANEJAMENTO.md](docs/PLANEJAMENTO.md)
- Pendências e riscos da Fase 1: [docs/FASE1-PENDENCIAS.md](docs/FASE1-PENDENCIAS.md)
- Fase 2 (casal e controle): [docs/FASE2.md](docs/FASE2.md)
- Fase 3 (diferenciais): [docs/FASE3.md](docs/FASE3.md)

```
apps/mobile/            app Expo (Expo Router, roda no Expo Go)
packages/core/          lógica de domínio em TypeScript puro (leitor Santander, conferência, categorias…)
packages/db-tests/      testes do schema e da RLS em Postgres real (PGlite)
supabase/               migrations, config e Edge Function parse-statement
fixtures/santander/     7 faturas anonimizadas + valores esperados
scripts/                anonimização, sincronização do core, seed
```

`pnpm install && pnpm test && pnpm typecheck`
