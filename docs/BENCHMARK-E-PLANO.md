# Benchmark e plano: gastos futuros, previsão e visual

Pesquisa feita em out/2026 em sites oficiais, centrais de ajuda, reviews e posts no X. Preços e recursos mudam, então confira antes de citar.

## 1. Apps comparados

| App | O que faz bem | O que trazemos |
|---|---|---|
| **Mobills** (BR) | Conecta contas e cartões, orçamento, metas, relatórios, versão web | — (o app segue sem Open Finance, por decisão) |
| **Organizze** (BR) | Open Finance, limite de gastos, lançamentos recorrentes | Lançamento recorrente → **gasto futuro "todo mês / todo ano"** |
| **YNAB** | *Targets* por categoria e *scheduled transactions*: mostra gastos futuros sem contar com renda que ainda não entrou | **Gasto agendado numa data**, somado ao mês certo |
| **Copilot Money** (finalista do Apple Design Award) | Seção *Upcoming* no painel, aba *Recurrings*, visual muito limpo; os pedidos de *cash-flow forecast* ainda estão no quadro de sugestões | **"Próximos gastos" no Início**, visual escuro com destaque em degradê |
| **Monarch** | *Forecasting* (mar/2026): projeção de longo prazo a partir dos dados reais; orçamento compartilhado para casal | **Previsão de 6 meses** a partir do histórico real |
| **PocketGuard** | *In My Pocket*: saldo menos contas futuras, metas e recorrências, ou seja, "quanto ainda posso gastar" | **Sobra/Falta do mês previsto**, quando a renda está informada |
| **Honeydue / Zeta** (casal) | Lembretes de contas criados no onboarding (60% dos usuários criam um), comentários por lançamento, contas privadas | Já tínhamos o gasto pessoal 🔒; **lembrete de conta** fica para a próxima fase |

## 2. O que apareceu no X

A busca no X por posts recentes sobre o tema é limitada (pouca indexação). O que foi encontrado:
- **Nath Finanças**: categorias demais fazem a pessoa desistir, então o formato simples funciona melhor. Isso reforça manter poucas telas e pouco texto.
- **Visor** (2026): o usuário elogia os "gráficos de tudo" porque mostram visualmente onde mudar o hábito. Daí a **linha do tempo única**, que junta passado e previsão no mesmo gráfico.
- **Finma** (MacMagazine): junta vários bancos **sem vincular contas**. É a mesma filosofia deste app (PDF/OFX), o que mostra que há público para isso.
- **Monarch e Copilot**: os perfis destacam prêmios de design (WSJ, Mobbin, Apple Design Award). Visual premium é argumento de escolha.
- **Copilot**: o assistente em beta "mostra o que importa antes de você procurar". Daí a ideia de deixar o Início proativo, com os próximos gastos e a previsão do mês que vem.

## 3. Princípios do redesenho
1. **Um número por tela**: o cartão em degradê responde à pergunta da tela (quanto gastei, quanto vou gastar).
2. **Menos texto**: explicações saíram das telas principais e a ação principal virou ícone (+).
3. **Passado e futuro no mesmo gráfico**: barra cheia mostra o realizado, a tracejada mostra a média e a laranja os planejados.
4. **Previsão explicável**: `previsto = média dos últimos 6 meses + planejados do mês`, sem caixa-preta.

## 4. Entregue agora
- **Aba Planejar** (substitui a aba Parcelas, que foi para Mais):
  - **linha do tempo** com os 6 meses realizados e os 6 previstos. Tocar num mês mostra o total e, para os meses passados, a variação sobre o mês anterior;
  - **previsão** com a média dos meses com dados (até 6), somada aos gastos planejados do mês. Com renda informada (Fluxo de caixa), mostra a sobra ou a falta;
  - indicadores: média, total dos próximos 6 meses e mês mais alto;
  - lista de **gastos futuros**.
- **Gasto futuro** (+ na aba Planejar ou Mais → Gasto futuro): valor, o que é, data (dd/mm vai para a próxima vez que a data chega), *uma vez / todo mês / todo ano*, quantas vezes (vazio = sem fim) e categoria opcional. Editar e excluir.
- **Início**: o total do mês fica no destaque em degradê, junto com a variação e o "previsto do mês que vem". Ganhou os botões **+ Lançar** e 👁 no topo, o cartão **Próximos gastos** (45 dias) e um atalho para a previsão. O "Top 10" virou "Onde mais gastou" (5 itens).
- **Visual**: nova paleta (tinta + índigo, escuro quase preto), cantos maiores, sombra suave, cabeçalhos grandes, controle segmentado. **Contraste AA** conferido por teste, agora também no degradê.
- **Banco**: tabela `planned_expenses` com RLS por casal, incluída na exportação de dados (LGPD). Apagar o usuário não fica bloqueado.

### Como a previsão é calculada
- Começa no mês seguinte à última fatura confirmada, nunca antes do mês corrente.
- A média usa os meses com dados entre os últimos 6. Um mês sem fatura não puxa a média para baixo.
- A média já inclui cartão, parcelas, assinaturas e Pix/dinheiro: é o gasto que sempre acontece. Use o **gasto futuro só para o que é novo ou pontual**, para não contar duas vezes.
- Uma ocorrência planejada com data antes de hoje não entra (ela já está ou vai estar no realizado).

## 5. Próximos passos sugeridos (em ordem)
1. **Lembrete de gasto futuro** (push 3 dias antes), como o lembrete de contas do Honeydue.
2. **"Já aconteceu?"**: quando aparece na fatura um lançamento parecido com um planejado, oferecer para dar baixa.
3. **Previsão por categoria** (média por categoria + planejado com categoria), comparada ao orçamento.
4. **Calendário do mês** com os dias dos gastos futuros e das recorrências (o pedido mais votado no quadro do Copilot).
5. **Widget** de tela inicial com o "previsto do mês" e o + Lançar.

## Publicar
```bash
npx supabase db push        # migration 20261016000001_planned_expenses
```
Nenhuma Edge Function mudou (o core copiado foi sincronizado só por consistência).

## Fontes
- Copilot: [vs YNAB](https://www.copilot.money/compare/ynab), [quick start](https://help.copilot.money/en/articles/11157550-quick-start-guide), [pedido de cash flow](https://feedback.copilot.money/feature-requests/p/income-vs-expenses-cash-flow-graph), [9to5Mac](https://9to5mac.com/2025/06/26/copilot-money-is-the-budgeting-app-youve-been-looking-for/)
- Monarch: [Forecasting](https://www.monarch.com/blog/forecasting)
- YNAB: [Targets](https://support.ynab.com/en_us/getting-started-with-targets-ryAEP08xC), [Plan template](https://support.ynab.com/en_us/creating-a-plan-template-ByZJZx_R9.md)
- PocketGuard: [Plan](https://pocketguard.com/help-category/plan/)
- Honeydue/Zeta: [TechCrunch](https://techcrunch.com/2017/08/07/honeydue-is-a-money-management-app-for-couples/), [NerdWallet (sindicado)](https://www.abc4.com/news/business/nerdwallet/3-budget-apps-for-couples-who-want-to-align-on-money/amp/)
- Mobills / Organizze: [App Store Mobills](https://apps.apple.com/BR/app/id921838244), [App Store Organizze](https://apps.apple.com/BR/app/id677699286), [Tecnoblog comunidade](https://tecnoblog.net/comunidade/t/melhor-app-de-gestao-financeira/46180)
- X: [Nath Finanças](https://x.com/nathfinancas/status/1411033237145755655), [Visor](https://x.com/joaosenzi/status/2027872711628800034), [Finma/MacMagazine](https://x.com/MacMagazine/status/1894137293549555842), [Monarch/WSJ](https://x.com/monarch_money/status/1742762398354755780), [Copilot](https://x.com/copilotmoney)

## Atualização — ondas 1 e 2 da pesquisa aprofundada
Relatório completo: [pesquisa/reports/Benchmark apps finanças casal.md](pesquisa/reports/Benchmark%20apps%20finan%C3%A7as%20casal.md).

| Recurso | Doc |
|---|---|
| Revisão por swipe, ritmo de gasto, alerta de valor em assinaturas, busca com totais ao vivo | (no código: `review-suggest.ts`, `pace.ts`, `price-change.ts`, `search.ts`) |
| Divisão do nosso e acerto de contas | [ACERTO-CASAL.md](ACERTO-CASAL.md) |
| Comentários e reações | [COMENTARIOS.md](COMENTARIOS.md) |
| Mesada pessoal 🔒 | [MESADA.md](MESADA.md) |
| Encontro do dinheiro | [ENCONTRO-DINHEIRO.md](ENCONTRO-DINHEIRO.md) |
| Calendário, previsão por categoria, "Já aconteceu?", lembretes, widget | [CALENDARIO.md](CALENDARIO.md), [PREVISAO-CATEGORIA.md](PREVISAO-CATEGORIA.md), [BAIXA-PLANEJADOS.md](BAIXA-PLANEJADOS.md), [LEMBRETES.md](LEMBRETES.md), [WIDGET.md](WIDGET.md) |

### Publicar tudo
```bash
npx supabase db push                          # migrations 20261016…–20261018000005
node scripts/sync-core-to-functions.mjs
npx supabase functions deploy notify          # agora também avisa comentários
```
