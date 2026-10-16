# Encontro do dinheiro

O check-in mensal virou um roteiro de **~20 min para o casal fazer junto**: um passo por tela,
barra de progresso, "Voltar" / "Próximo". Mais → **Encontro do dinheiro** (ou o atalho do Início,
que aparece até o dia 15 enquanto o encontro da última fatura não foi concluído).
O resumo antigo continua em Mais → Check-in do mês (e em "Ver resumo do mês" na abertura do encontro).

## Pauta fixa
| # | Passo | O que aparece |
|---|---|---|
| 1 | Como foi o mês (3 min) | Total da fatura, vs mês anterior, vs previsto (média dos meses anteriores + planejados do mês) e a maior economia sugerida |
| 2 | O que mudou (3 min) | Categorias que subiram/caíram e estabelecimentos novos |
| 3 | Orçamento (3 min) | Categorias em 80%/100%; "Manter" ou "Subir p/ R$ X" (gasto arredondado para cima em R$ 50), gravado a partir do mês seguinte |
| 4 | Assinaturas (3 min) | Cobranças mensais ativas (assinaturas primeiro); **Manter / Cancelar**. Cancelar agenda um lembrete local para o dia seguinte às 19h e entra na lista salva |
| 5 | Próximo mês (3 min) | Previsão (`forecast.ts`): média + gastos futuros, sobra se houver renda; atalho "Adicionar gasto futuro" |
| 6 | Metas (2 min) | Progresso e quanto guardar por mês |
| 7 | Combinados (3 min) | Até 3 textos curtos (≤ 80); os do último encontro concluído reaparecem com "Manter" |

Ao concluir: tela de fechamento com combinados, cancelamentos, data do próximo encontro e "Compartilhar".

## Onde está
- Lógica pura: `packages/core/src/money-date.ts` (`buildMoneyDate`, `normalizeAgreements`, `previousAgreements`,
  `nextMoneyDate`, `moneyDateReminders`, `cancelReminder`, `shouldSuggestMoneyDate`, `moneyDateText`). Testes em
  `packages/core/test/money-date.test.ts`.
- Banco: `supabase/migrations/20261018000004_money_date.sql` — tabela `money_dates` (uma linha por casal e mês
  revisado; `agreements` e `to_cancel` em jsonb validados por check; `completed_at/by`; RLS por `is_member`).
  Teste: `packages/db-tests/test/money-date.test.ts`. **Ainda não entra em `export_household_data`** (não redefinido aqui).
- App: `src/app/(app)/encontro.tsx`, `src/components/MoneyDate.tsx` (atalho do Início e cartão do lembrete),
  `src/lib/money-date.ts` (dados, preferência local e notificações).

## Lembrete mensal
- Notificação **local** (`expo-notifications`, gatilho `DATE`), mesmo padrão de `docs/LEMBRETES.md`: ids
  `money-date:<data>` (os 3 próximos meses) e `money-cancel:<chave>`; nunca cancela os `planned:`.
- Data: o primeiro **sábado** (ou sexta/domingo) a partir do **dia seguinte ao vencimento da última fatura**
  (ou início/meio do mês), às 10h. Texto: "Encontro do dinheiro de outubro — 20 min".
- Preferência por aparelho (AsyncStorage `moneyDate.v1`): cada um liga no próprio celular. Canal Android "Encontro do dinheiro".

## Publicar
```bash
npx supabase db push
node scripts/sync-core-to-functions.mjs
```
