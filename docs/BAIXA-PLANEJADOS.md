# "Já aconteceu?": baixa de gasto planejado

Quando um gasto planejado aparece no realizado (fatura ou Pix/dinheiro), a aba **Planejar** mostra o cartão **Já aconteceu?** com a sugestão. O casal toca em ✓ para confirmar ou em ✕ se não for aquele lançamento. Ocorrências que já passaram e não têm lançamento parecido aparecem com o botão **Feito**, para marcar à mão. Ocorrência com baixa não volta a ser sugerida.

## Como o par é encontrado (`packages/core/src/planned-match.ts`)
- **Ocorrências avaliadas**: as dos últimos 60 dias e as dos próximos 10 (cobre compra adiantada). Ficam de fora as que já têm baixa "feito" e as dispensadas (ignorado sem lançamento).
- **Valor**: igual vale 50 pontos; dentro de ±10% vale de 25 a 40. Fora disso o lançamento não é candidato.
- **Data**: até ±10 dias da data planejada vale de 30 (mesmo dia) a 10 pontos. No **cartão** também vale a competência, isto é, a fatura do mês planejado ou do mês seguinte, com 8 pontos. Fora disso o lançamento não é candidato.
- **Descrição**: até 20 pontos de bônus pelos tokens em comum (sem acento, sem números, sem palavras vazias; prefixo de 4 letras ou mais também conta).
- Pagamento, estorno, encargo e os totais ocultos do gasto pessoal do par nunca entram. Abaixo de 40 pontos não há sugestão.
- **Confiança**: alta a partir de 75 pontos, média a partir de 55, baixa abaixo disso. Se o segundo candidato fica a menos de 8 pontos do primeiro, a sugestão é marcada como **ambígua** e a confiança cai para média. No app, a confiança média ou baixa mostra o selo "confira".
- **Um para um**: as sugestões são atribuídas pela maior pontuação. Cada ocorrência recebe uma sugestão só, e um lançamento serve a uma ocorrência só. Lançamentos que já deram baixa e pares recusados com ✕ ficam de fora.

## Banco (`supabase/migrations/20261017000002_planned_matches.sql`)
A tabela `planned_matches` tem as colunas `household_id`, `planned_id`, `occurrence_date`, `transaction_id` (opcional), `status` ('feito' | 'ignorado') e `created_by`.
- RLS por casal via `public.is_member(household_id)`. Um gatilho confere se o planejado e o lançamento são do mesmo casal da baixa.
- Apagar o casal ou o planejado apaga as baixas. Apagar o lançamento mantém a baixa, sem o vínculo (`set null`). Apagar o usuário deixa `created_by` como null.
- Cada ocorrência tem no máximo uma baixa "feito", e cada lançamento dá baixa em no máximo uma ocorrência.

```bash
npx supabase db push        # migration 20261017000002_planned_matches
```

## Pendências
- A tabela entra na exportação de dados (LGPD) — migration `20261017000003_export_planned_matches.sql`.
- A previsão (`forecast.ts`) não usa as baixas: ela já ignora as ocorrências com data anterior a hoje.
