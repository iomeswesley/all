# Calendário do mês

Tela `/calendario` (atalho com ícone de calendário no cabeçalho da aba **Planejar**).

- **Grade**: semanas de domingo a sábado; dias de fora do mês aparecem apagados (tocar neles troca de mês).
- **Pontinhos**: laranja (`planned`) = gasto planejado; primário = recorrência esperada. Hoje fica em destaque.
- **Dia selecionado**: lista os eventos e o total do dia. Tocar num planejado abre `/planejado?id=`; numa recorrência, `/recorrencias`.
- **Topo**: total previsto do mês, separado em planejado e recorrente.

## Core (`packages/core/src/calendar.ts`)

- `buildCalendarMonth({ monthKey, planned, recurring, today })` → `{ weeks, totalCents, plannedCents, recurringCents, busyDays }`.
- `monthEvents(monthKey, planned, recurring)` → eventos do mês em ordem (planejados antes dos recorrentes no mesmo dia).
- `expectedRecurringFrom(detectRecurring(...).items, txs)` → recorrências **ativas** com dia típico = mediana do dia em que a cobrança caiu. O dia é limitado ao último dia do mês (31 → 30 em setembro, 28/29 em fevereiro). Não aparecem antes do 1º mês em que foram vistas.
- Planejados usam `occurrencesBetween` (mesma regra da previsão).

Testes: `packages/core/test/calendar.test.ts`.

Limitações: a mediana do dia não trata "virada" (cobranças entre dia 30 e dia 1); o valor da recorrência é o típico (mediana), não o último.
