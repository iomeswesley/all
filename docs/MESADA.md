# Mesada pessoal 🔒 ("dinheiro livre")

Cada pessoa tem um valor por mês para gastar sem dar satisfação. Quem é dono da mesada vê a barra, quanto resta e quanto dá por dia até o fim do mês. O par vê só a porcentagem usada ("usou 62%"). Os itens nunca aparecem para o par.

## Como funciona
- **O que conta como usado:** todo gasto marcado como **pessoal 🔒** (`is_private`) da pessoa no mês. Estornos pessoais abatem; pagamentos não contam.
- **Mês de competência:** na fatura, o mês do vencimento (`statement_month`), e só depois que a fatura é confirmada. No Pix, dinheiro e débito, o mês do pagamento. Como não há Open Finance, o cartão só entra quando a fatura é confirmada. Durante o mês, a barra anda com os lançamentos manuais.
- **Estados** (`packages/core/src/allowance.ts`): *no caminho* abaixo de 80%; *perto do limite* de 80% a 100% (conta em inteiros); *estourou* acima de 100%. "Por dia" é o que resta dividido pelos dias que faltam, contando hoje, arredondado para baixo.

## Decisão: quem define o valor
**O casal define junto.** Qualquer um dos dois pode ajustar a mesada de qualquer membro. O banco grava quem mudou e quando (`updated_by` e `updated_at`, por gatilho, sem como atribuir a mudança ao par). A liberdade está no uso do dinheiro, não no valor: o valor sai do orçamento comum, por isso é um acordo.

## Onde fica
| Parte | Arquivo |
|---|---|
| Tabela `member_allowances` + função `allowance_status(p_month)` | `supabase/migrations/20261018000003_allowance.sql` |
| Testes do banco (par vê totais e não itens, isolamento, anônimo, saída do casal) | `packages/db-tests/test/allowance.test.ts` |
| Regras (estado, resta por dia, texto do par) | `packages/core/src/allowance.ts` + `packages/core/test/allowance.test.ts` |
| Cartão no Início e dica ao lançar | `apps/mobile/src/components/AllowanceCard.tsx` |
| Configuração (Mais → Dinheiro livre) | `apps/mobile/src/app/(app)/mesada.tsx` |

### Banco
- `member_allowances(household_id, user_id, monthly_cents, updated_by, updated_at)` tem RLS por casal (`is_member`). A chave estrangeira aponta para `members(household_id, user_id)` com `on delete cascade`: quando a pessoa sai, é removida ou exclui a conta, a mesada some junto. `updated_by` aponta para `auth.users` com `on delete set null`.
- `allowance_status(p_month 'AAAA-MM')` é `SECURITY DEFINER`, com `search_path` fixo e sem permissão para `anon`. Devolve, por membro do casal de quem chama, `{user_id, display_name, monthly_cents, used_cents, is_me}`. Só devolve totais, nunca linhas. Um mês inválido devolve vazio.
- A tabela ainda **não** entra em `export_household_data`; essa inclusão fica com o coordenador.

## Publicar
```bash
npx supabase db push
node scripts/sync-core-to-functions.mjs   # o core foi atualizado
```
