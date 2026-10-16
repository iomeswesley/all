# Acerto do casal — divisão do "nosso"

**Mais → Acerto do casal** (e um cartão no Início quando há saldo). Mostra, por mês, quanto cada um pagou do que é "nosso", quanto deveria ter pago pela regra e o saldo acumulado: "Bia deve R$ 380,00 a você" ou "Tudo certo". O botão **Registrar acerto** grava um Pix ou dinheiro feito fora do app e abate o saldo. Quem registrou pode desfazer.

## Regra
- **50/50**, **pela renda** ou **personalizado** (ex.: você 60%). Vale **deste mês em diante** (ou para **todo o histórico**), como o orçamento. Os meses anteriores continuam com a regra que tinham.
- **Pela renda**: cada pessoa informa a própria renda. Só ela lê o valor (RLS). O par recebe só o **percentual inteiro** pela função `split_income_shares()` (SECURITY DEFINER). Enquanto faltar uma das rendas, vale 50/50 e a tela avisa. Limitação: o percentual usa a renda **atual** para todos os meses com essa regra. E, com duas pessoas, quem sabe a própria renda consegue estimar a do outro pela proporção (o arredondamento deixa só uma faixa). Isso é inerente à divisão proporcional.
- **Exceção por lançamento** ("Dividir diferente"): 100% meu, 100% do par ou outra proporção, e "quem pagou" informado à mão. Acesso: tocando no lançamento na tela de acerto ou pelo ⋯ do lançamento na tela da fatura.

## O que entra
- Lançamentos de faturas confirmadas e do Pix e dinheiro, menos pagamentos. **Gasto pessoal 🔒 nunca entra.** Estornos entram negativos e desfazem a compra ao centavo.
- "Nosso" (sem dono) é dividido pela regra. Um lançamento **com dono** só entra quando foi pago pelo outro: o dono deve 100% dele.
- **Quem pagou**, nesta ordem: exceção → dono do cartão (Cartões e donos) → no Pix e dinheiro, quem lançou (`transactions.created_by`, nova) → quem importou a fatura. Lançamentos manuais anteriores a esta versão ficam sem quem lançou: aparecem em "sem quem pagou" e ficam fora da conta até alguém indicar o pagador.

## Conta (packages/core/src/split.ts)
Centavos inteiros. Cada lançamento é repartido pelo método dos maiores restos (BigInt), então **a soma das partes é sempre o total**. Saldo = pagou − deveria + acertos enviados − acertos recebidos. A soma dos saldos do casal é sempre zero. Os testes de propriedade cobrem milhares de casos aleatórios.

## Banco (20261018000001_split.sql)
`split_rules`, `member_incomes` (só a própria pessoa), `split_overrides` (só em lançamento que a pessoa enxerga), `settlements` (só entre membros; apaga quem registrou), `transactions.created_by` e `split_entries()` (SECURITY INVOKER, um jsonb sem o limite de 1000 linhas). FKs para `auth.users` com `on delete set null`, exceto `member_incomes.user_id`, que é chave e usa cascade: a renda some com a pessoa e também quando ela sai do casal (trigger). A exportação de dados (`export_household_data`) **ainda não inclui** essas tabelas: fica a cargo do coordenador.

```bash
npx supabase db push
node scripts/sync-core-to-functions.mjs
```
