# Previsão por categoria × orçamento

## Como é calculada
- **previsto(categoria, mês) = média da categoria nos meses com dados (até 6) + planejados da categoria no mês.**
- Os meses da média são os mesmos de `forecastMonths`. Um mês sem fatura não puxa a média para baixo.
- Um lançamento sem categoria e um planejado sem categoria entram em **Outros**.
- **A soma das categorias é igual ao previsto do mês, ao centavo.** A média de cada categoria é truncada e os centavos que faltam para chegar ao `round(total / n)` de `forecastMonths` vão para as categorias com maior resto (empate: menor id). Um teste confere isso em 500 cenários aleatórios, com estornos e meses vazios.
- Estornos entram negativos. Uma categoria pode ficar com previsto negativo: ela conta na soma, mas não aparece no gráfico.

## Comparação com o orçamento
`forecastVsBudget(mês, effectiveBudgets(rows, mês))` compara com o limite que vale no mês previsto:

| Status | Quando |
|---|---|
| `ok` | abaixo de 80% do limite |
| `perto` | a partir de 80% |
| `estoura` | a partir de 100% (atingir o limite exato já conta) |

As categorias sem limite ficam com `level: null`. A lista vem nesta ordem: as que estouram, as que estão perto, depois as demais por valor.

## API (`@financas/core`)
- `categoryBaselines(txs, lastMonth, window?)`: média por categoria.
- `forecastByCategory(input, forecast?)`: um item por mês previsto, com as categorias.
- `forecastVsBudget(month, limits)`: devolve as linhas e os contadores `over` e `near`.
- `FORECAST_LEVEL_LABEL`: os rótulos em pt-BR.

## No app
- **Planejar**: com um mês previsto selecionado, o cartão "Por categoria" fica logo abaixo do gráfico (`components/ForecastByCategory.tsx`). Para cada categoria há uma barra com o previsto, um traço no limite e, em vermelho, a parte que passa dele. Um selo resume quantas categorias vão estourar. O cartão mostra 6 categorias, e "Ver todas" abre o resto.
- **Orçamento**: cada categoria ganha a linha discreta "Previsto <mês>: R$ X", em âmbar quando está perto do limite e em vermelho quando vai estourar. O mês é o primeiro previsto, ou seja, o próximo.
- O cálculo compartilhado está em `lib/forecast-category.ts` (`categoryForecastFor`).
