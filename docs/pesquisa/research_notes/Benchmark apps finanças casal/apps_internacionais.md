# Apps internacionais de orçamento/finanças pessoais — inventário de features e lançamentos 2025–2026

> Método e limitações: pesquisa feita em 16/10/2026 usando somente WebSearch (snippets resumidos pelo buscador). O WebFetch e o curl direto para os sites oficiais (ynab.com, copilot.money, monarch.com, actualbudget.org, lunchmoney.app, releasebot.io) foram **bloqueados pelo proxy do ambiente** (DNS/403), então nenhuma página foi lida na íntegra. As afirmações abaixo vêm dos resumos de busca; o domínio de cada fonte é indicado. Quando a fonte é um blog de review/afiliado ou um agregador (Releasebot), isso é sinalizado. Detalhes de conexão bancária foram omitidos de propósito (o app-alvo não tem Open Finance).

## 1. Forecasting / projeção de fluxo de caixa / contas futuras / calendário

### Takeaway
Em 2026 a projeção de saldo virou feature premium: o Monarch lançou Forecasting com cenários "what-if" no plano Plus (US$199/ano), o Simplifi vende "Projected Balances" com até 12 meses, e o Actual Budget lançou um relatório Balance Forecast. Para quem faz entrada manual, o padrão comum é o mesmo em todos: **recorrências/pagamentos planejados → saldo projetado + calendário**, e isso funciona sem conexão bancária.

### Cited Findings
**Monarch Money**
- Forecasting chegou em abril de 2026 como recurso do Plus para modelar cenários "what-if". Em junho/2026 vieram múltiplos cenários e em julho/2026 o forecasting lado a lado. O Forecasting do Plus é só na web desktop (a fonte tem ~173 dias, então o mobile pode ter mudado) — [Centinel vs Monarch (concorrente)](https://www.centinelmoney.com/resources/centinel-vs-monarch-money); [Monarch blog: July product update](https://www.monarch.com/blog/july-product-update); [Monarch blog: June product update](https://www.monarch.com/blog/june-product-update)
- O Monarch Core tem uma tela de Cash Flow, mas ela mostra o resultado do orçamento, não uma projeção do saldo da conta corrente. Preços: Core US$99,99/ano ou US$14,99/mês; Plus US$199/ano — [Centinel](https://www.centinelmoney.com/resources/centinel-vs-monarch-money); [The College Investor](https://thecollegeinvestor.com/35342/monarch-review/)
- O plano Plus também inclui previsão de aposentadoria, ferramentas de planejamento sucessório e acesso a coaching financeiro. Em agosto/2026 a previsão de aposentadoria antecipada passou a considerar as multas de saque de IRA/401(k) — [The College Investor](https://thecollegeinvestor.com/35342/monarch-review/); [Releasebot (agregador)](https://releasebot.io/updates/monarch)
- Um calendário de recorrências mostra contas, assinaturas, transferências e salários — [Centinel](https://www.centinelmoney.com/resources/centinel-vs-monarch-money)

**Quicken Simplifi**
- O "Spending Plan" parte da renda e das contas, desconta as despesas recorrentes e as metas de poupança, e mostra o que sobra. O valor é atualizado a cada transação — [The Penny Hoarder](https://www.thepennyhoarder.com/budgeting/simplifi-app/)
- "Projected Balances" projeta os saldos futuros a partir das transações, da renda e das contas. Uma página da Quicken fala em até 1 ano à frente, com simulações "what-if" — [Quicken (vendor)](https://www.quicken.com/products/simplifi-ai-assist/); [Yahoo/FinTech Breakthrough Awards 2026](https://finance.yahoo.com/markets/articles/quicken-simplifi-named-personal-finance-170000238.html)
- O Quicken Assist (IA) acompanha a projeção e avisa quando algo precisa de ajuste. O Simplifi foi "Personal Finance App of the Year" no FinTech Breakthrough 2026. Preço a partir de US$3,99/mês — [Quicken](https://www.quicken.com/products/simplifi-ai-assist/); [Yahoo](https://finance.yahoo.com/markets/articles/quicken-simplifi-named-personal-finance-170000238.html); [Quicken blog](https://www.quicken.com/blog/best-personal-finance-software-for-monthly-budget-creation-and-debt-reduction-in-2026/)

**Copilot Money**
- Recorrências são detectadas no onboarding e ficam numa seção "Recurrings". As cobranças futuras alimentam a projeção de fluxo de caixa. A aba Cash Flow mostra renda, gasto e resultado líquido em YTD, MTD, 12 meses, 3 meses ou 4 semanas. Na web faltavam as abas Goals e Cash Flow (as fontes divergem) — [floosyo (concorrente)](https://floosyo.com/en/blog/recurring-payment-app); [Forbes Advisor](https://www.forbes.com/advisor/banking/copilot-budget-app-review/); [walletgrower](https://walletgrower.com/blog/copilot-money-review-2026)

**Actual Budget (open source)**
- Release 26.6.0 (1/jun/2026): relatório Balance Forecast (experimental), interface para "budget automations" (goal templates), o relatório Crossover saiu do experimental e os temas customizados ficaram estáveis — [Actual blog 26.6.0](https://actualbudget.org/blog/release-26.6.0/)

**Wallet by BudgetBakers**
- "Planned Payments" para contas recorrentes, com confirmação manual ou automática e um card de próximos pagamentos na home. A loja descreve o recurso como forma de ver o impacto dos pagamentos no fluxo de caixa. Aviso da ajuda: em vários dispositivos, sobretudo offline, podem surgir registros duplicados. O recurso está no plano grátis — [BudgetBakers Help](https://support.budgetbakers.com/hc/en-us/articles/7149523920786-Setup-Planned-Payments); [Google Play](https://play.google.com/store/apps/details?id=com.droid4you.application.wallet&hl=en); [Finder UK](https://www.finder.com/uk/budgeting/wallet-budgetbakers-review)

**Money Manager (Realbyte)**
- A tela inicial pode ser "Daily" ou "Calendar" (More > Transaction Settings > Start Screen). O calendário mostra receitas e despesas por dia com indicadores coloridos. O site da Realbyte lista "Improved Calendar Visuals", sem data — [Realbyte Help](https://help.realbyteapps.com/hc/en-us/articles/6725959537049-How-to-change-the-start-screen-to-Daily-or-Calendar); [mwm.ai](https://mwm.ai/apps/money-manager-expense-budget/560481810); [realbyteapps.com](https://www.realbyteapps.com/)

### Inferences
- Para um app só com entrada manual ou importação de arquivo, o modelo mais aproveitável é o Planned Payments do Wallet ou o calendário de recorrências do Monarch: o usuário cadastra recorrências, o app gera saldo projetado e um calendário, e cada item pode ser confirmado como transação real (manual ou automático).
- O Monarch cobrar cenários "what-if" e comparação lado a lado no tier caro indica que o mercado vê forecasting como diferencial de valor.

### Gaps
- Não achei descrição primária do forecasting do YNAB (o YNAB não tem projeção de saldo; o foco são Targets/metas). Também não houve detalhes de calendário para Lunch Money, Emma ou Spendee.
- Não confirmei se o Forecasting do Monarch já chegou ao mobile.

## 2. Recorrências, assinaturas, alertas de aumento de preço, lembretes de contas

### Takeaway
O Rocket Money continua sendo a referência em assinaturas: avisa sobre aumento de preço antes da cobrança e cancela pelo app. O PocketGuard lançou em 2026 o "Pace", um alerta de ritmo de gasto. Monarch e Copilot fazem detecção de recorrências com calendário/lista de próximas cobranças. Os lembretes de contas e o calendário de recorrências funcionam com dados manuais; a detecção automática depende de ter histórico importado.

### Cited Findings
- **Rocket Money:** avisa sobre aumentos de preço de assinaturas antes de a cobrança cair. O plano grátis inclui lembretes de contas. A negociação de contas cobra de 35% a 60% da economia obtida. O Premium é "pague quanto quiser", de US$7 a 14/mês — [rocketmoney.com/learn (vendor)](https://www.rocketmoney.com/learn/personal-finance/best-budgeting-apps); [walletgrower](https://walletgrower.com/blog/rocket-money-review-2026); [CNBC Select](https://www.cnbc.com/select/rocket-money-review/)
- **Rocket Money, agosto/2026:** um artigo diz que foi lançado o "Rowan", agente de IA de um novo tier Premium Plus que monitora as contas e age por SMS. É fonte única, não verificada — [busca, resultado entre reviews do Rocket Money](https://www.thequalityedit.com/articles/rocket-money-review)
- **PocketGuard:** "Pace" (lançado em março/2026) avisa quando o ritmo de gasto está acima do orçamento do mês, antes de o dinheiro acabar. O plano Plus inclui notificações de vencimento de contas e de transações grandes, além de cancelamento de assinatura no app. Plus: US$12,99/mês ou US$74,99/ano. O preço do vitalício diverge entre fontes (US$149,99 vs US$79,99) — [PocketGuard blog (vendor)](https://pocketguard.com/blog/pocketguard-vs-rocket-money/); [getfinny](https://getfinny.app/blog/pocketguard-pricing-2026)
- **Copilot:** a seção Recurrings revisa as recorrências já pagas e acompanha as do mês seguinte e além. Recorrências variáveis podem precisar de ajuste manual — [floosyo](https://floosyo.com/en/blog/recurring-payment-app); [walletgrower](https://walletgrower.com/blog/copilot-money-review-2026)
- **Copilot, beta de agosto/2026:** o Money Assistant (beta) faz rollovers mais rápidos, atualiza recorrências mais depressa, dá sugestões mais ricas e mostra gráficos no chat — [Releasebot (agregador)](https://releasebot.io/updates/copilot-money)
- **Monarch:** calendário de recorrências com contas, assinaturas, transferências e salários — [Centinel](https://www.centinelmoney.com/resources/centinel-vs-monarch-money)
- **Apps indie de assinaturas:** CentryAI identifica cobranças recorrentes em recibos e na caixa de e-mail; Subscrr é um lançamento recente focado em contas recorrentes — [Product Hunt categoria Budgeting](https://www.producthunt.com/categories/budgeting-and-expense-tracking)

### Inferences
- Sem dados bancários, um alerta de aumento de preço ainda é possível: basta comparar o valor de cada nova ocorrência de uma recorrência cadastrada com a anterior e avisar quando houver diferença.
- O "Pace" do PocketGuard (ritmo de gasto vs. dias que restam no mês) só precisa de orçamento e lançamentos, então funciona igual com entrada manual.

### Gaps
- Não encontrei changelog oficial do Rocket Money para 2025–2026 nem confirmação primária do "Rowan".

## 3. Regras/categorização, divisão de transações, tags, recibos, notas

### Takeaway
A tendência de 2025–2026 é a IA aplicada a recibos e categorização. O Monarch lê recibos (foto ou e-mail), casa com a transação, adiciona notas e divide por categoria automaticamente. O Tiller lançou categorização opcional por IA. O YNAB criou o "Card Mode" para revisar transações deslizando. O Actual Budget está trocando templates de regras por fórmulas.

### Cited Findings
- **Monarch, recibos:** a leitura de recibos (Winter Release) casa o recibo com a transação, adiciona notas sobre o que foi comprado e divide em transações categorizadas quando faz sentido. Depois vieram o encaminhamento de recibos por e-mail (julho/2026) e a leitura de recibos também na web — [Monarch blog: Winter Release](https://www.monarch.com/blog/winter-release); [Monarch blog: July update ("Email Forwarding")](https://www.monarch.com/blog/july-product-update); [The College Investor](https://thecollegeinvestor.com/35342/monarch-review/)
- **YNAB, Card Mode (22/set/2026):** revisão de transações uma a uma no estilo Tinder — desliza para a direita para aprovar, para a esquerda para deixar para depois — com um toggle para voltar à lista — [YNAB What's New](https://www.ynab.com/whats-new)
- **YNAB, 2026:** novas telas de transação no iOS (27/mai) e no Android (8/jul) facilitam lançar pagamentos de cartão e transferências. A importação por arquivo foi redesenhada entre ago e set/2026, com CSV como formato preferido. Também vieram o preset de data "Last Month" no registro de contas e uma tela de detalhes de match no Android — [YNAB Updates](https://support.ynab.com/updates-to-ynab-S1f4aRLeC); [YNAB What's New](https://www.ynab.com/whats-new)
- **Tiller (Summer 2026):** AutoCat ganhou "Description Match" e "AI Suggest" (IA opcional, "nunca treina com seus dados"). Também vieram o "Data Cleanup" para mesclar contas duplicadas e o Console mobile responsivo. Por enquanto, tudo isso só no Google Sheets — [Tiller What's New 2026](https://tiller.com/whats-new-tiller-2026/)
- **Actual Budget 26.6.0:** o templating nas ações de regras foi descontinuado em favor de "formulae" — [Actual 26.6.0](https://actualbudget.org/blog/release-26.6.0/)
- **Copilot:** a divisão clássica de transações está disponível no iOS, macOS e iPadOS. Em set/2026, buscar ou filtrar transações no iOS passou a mostrar total gasto, total de renda e líquido dos resultados. Na Dispatch de 8/out/2026 aparece "Multi-Select Transaction Summary" (totais ao selecionar várias transações) — [Copilot Dispatch](https://www.copilot.money/dispatch); [Releasebot](https://releasebot.io/updates/copilot-money)
- **Lunch Money mobile:** a v2.4.0 permite anexos ao criar transações e lembra o estado expandido/recolhido da Home. A v2.5.1 (jun/2026) mostra o símbolo da moeda. Há integração com Zapier — [Lunch Money Changelog](https://feedback.lunchmoney.app/changelog)
- **Money Manager (Realbyte), iOS 2.12.X (out/2025):** trocar a conta de uma transferência, recolher grupos de contas e anexar várias fotos — [Realbyte Help](https://help.realbyteapps.com/hc/en-us/articles/48874290257433-iOS-2-12-X-Update-October-2025)
- **Fina:** categorização automática por IA com ajuste manual e perfis múltiplos (pessoal, família, empresa), separados ou consolidados — [fina.money](https://www.fina.money/); [toolsforhumans](https://www.toolsforhumans.ai/ai-tools/fina-money)

### Inferences
- O Card Mode do YNAB é um padrão de UX que se aplica direto à importação de extrato CSV/OFX: o usuário revisa as transações importadas em cards, desliza para aprovar e aceita ou corrige a categoria sugerida.
- Totais ao vivo sobre filtros ou seleção múltipla (Copilot) são simples de implementar e ajudam muito o casal a responder "quanto gastamos com X".

### Gaps
- Não consegui ler a UX de regras do Monarch, do Lunch Money ou do Copilot em fonte primária. A documentação de tags e splits do Monarch, Spendee e Emma não apareceu nas buscas.

## 4. Metas/sinking funds, "safe to spend", rollover, relatórios (Sankey, patrimônio, tendências), retrospectiva anual/"Wrapped"

### Takeaway
Sankey virou recurso padrão: Monarch (web e, desde 2026, mobile) e Actual (26.5.0) têm. Também em 2026, o Monarch trouxe treemaps e dividiu as metas em "Save up" e "Pay down". O Copilot tem rollover, "Rebalancing" e Month/Year in Review. O "safe to spend" segue com PocketGuard ("In My Pocket") e Simplifi (Spending Plan). Recaps estilo Wrapped aparecem no Copilot, no Actual (Wrapped 2025, um web app à parte) e no weekly recap do Monarch.

### Cited Findings
- **Monarch, Goals redesenhado:** "Save up goals" para reserva de emergência, entrada de imóvel ou viagem e "Pay down goals" para cartões e empréstimos. Saiu do beta em junho/2026 — [Monarch Winter Release](https://www.monarch.com/blog/winter-release); [Monarch June update](https://www.monarch.com/blog/june-product-update)
- **Monarch, relatórios:** os relatórios da web chegaram ao mobile, incluindo o Sankey de cash flow (junho/2026). Treemap de gastos e de renda (ago/2026), treemap de portfólio (jul/2026). O widget de gastos passou a ignorar meses sem dados no cálculo da média — [Monarch June update](https://www.monarch.com/blog/june-product-update); [Releasebot](https://releasebot.io/updates/monarch)
- **Monarch, weekly recap:** resumo semanal no dashboard e por e-mail, com perguntas de acompanhamento ao AI Assistant — [Monarch Winter Release](https://www.monarch.com/blog/winter-release)
- **Monarch, score de crédito:** atualizações mensais com gráfico, alertas de mudança e acompanhamento compartilhado pela casa — [The College Investor](https://thecollegeinvestor.com/35342/monarch-review/)
- **Copilot:** rollover (carregar a sobra para o mês seguinte) e "Rebalancing", que redistribui o orçamento entre categorias conforme o comportamento real sem mudar o total. "Month and Year in Review" traz relatório de gasto, renda, investimentos e tendências; o Month in Review fica na aba Transactions. Na web não havia month/year in review — [Money with Katie](https://moneywithkatie.com/copilot-review-a-budgeting-app-that-finally-gets-it-right/); [Copilot Help](https://help.copilot.money/en/articles/10310024-month-and-year-in-review); [walletgrower](https://walletgrower.com/blog/copilot-money-review-2026)
- **Actual Budget 26.5.0 (3/mai/2026):** relatórios Age of Money e Sankey (experimentais), um relatório "Budget Analysis" (orçado vs. real vs. saldo acumulado, considerando o rollover) e 5 temas da comunidade. A 26.6.0 trouxe Crossover estável e Balance Forecast — [Actual 26.5.0](https://actualbudget.org/blog/release-26.5.0/); [Actual 26.6.0](https://actualbudget.org/blog/release-26.6.0/)
- **Actual Budget Wrapped 2025:** web app que gera a retrospectiva do ano (top categorias, tendência de renda, número de transações). O processamento é local no navegador — [Actual blog](https://actualbudget.org/blog/actual-budget-wrapped-2025)
- **YNAB:** o celebratório compartilhável quando um empréstimo é quitado e o novo visual das barras de progresso — [YNAB Updates](https://support.ynab.com/updates-to-ynab-S1f4aRLeC)
- **PocketGuard "In My Pocket":** o que sobra depois das contas recorrentes, gastos agendados e poupança, atualizado a cada transação. Um reviewer viu o valor negativo no início por cálculo errado — [CNBC Select](https://www.cnbc.com/select/pocketguard-budgeting-app-review/); [Get Rich Slowly](https://www.getrichslowly.org/pocketguard-review/); [Motley Fool](https://www.fool.com/money/personal-finance/pocketguard-review)
- **Lunch Money:** no Android, Trends, Stats e Net Worth foram ampliados e a Home passou a aceitar períodos de orçamento customizados. A Forbes diz que falta "goal-setting" e que não há versão grátis — [Google Play](https://play.google.com/store/apps/details?id=com.lunchbaglabs.lunchmoney&hl=en_US); [Forbes Advisor](https://www.forbes.com/advisor/banking/best-budgeting-apps/)
- **Fina:** dashboards de blocos arrastáveis (texto, gráficos, tabelas, fórmulas, métricas customizadas), com páginas ilimitadas e vários orçamentos com períodos próprios — [fina.money blog](https://www.fina.money/blog/what-fina-can-do-that-others-can-not); [toolsforhumans](https://www.toolsforhumans.ai/ai-tools/fina-money)
- **Monzo "Year in Monzo"** (banco do Reino Unido, recap de 2024): o usuário escolhe o tom "nice" ou "savage" — [Blackpool Gazette](https://www.blackpoolgazette.co.uk/business/consumer/monzo-wrapped-how-to-find-2024-year-in-review-4911556)

### Inferences
- O conjunto "premium" de relatórios em 2026 é: Sankey, treemap, patrimônio e um recap periódico (semanal e anual). Para um app de casal, um recap semanal compartilhado entre os dois (como o do Monarch) e um "Wrapped" anual do casal seriam diferenciais baratos, porque usam só dados que o app já tem.
- Metas separadas entre "juntar" e "quitar" (Monarch) é um modelo mental claro para casais.

### Gaps
- Não confirmei se YNAB ou Monarch têm "Wrapped" anual nativo em 2025.

## 5. Widgets, Apple Watch, Live Activities, Shortcuts, entrada rápida

### Takeaway
O ecossistema Apple é o ponto forte do Copilot (widgets, Watch, Siri, Mac). O YNAB tem Siri/Shortcuts para consultar o saldo de categorias. Não encontrei evidência confiável de Live Activities em nenhum dos apps pesquisados.

### Cited Findings
- **Copilot:** widgets nativos de iOS com saldos em tempo real, "glances" no Apple Watch, atalhos da Siri e app de Mac. Não há Android — [floosyo](https://floosyo.com/en/blog/budget-widget-iphone); [Penny Hoarder](https://www.thepennyhoarder.com/budgeting/budgeting-copilot-money-review/)
- **Copilot web:** lançado e coberto pelo 9to5Mac em janeiro/2026 — [9to5Mac](https://9to5mac.com/2026/01/01/copilot-money-brings-clarity-to-your-finances-now-on-the-web/)
- **Copilot MCP (beta, 2026):** conecta o Copilot Money a ferramentas de IA — [Copilot Dispatch](https://www.copilot.money/dispatch)
- **YNAB:** saldo das categorias pela Siri e pelo Shortcuts (iOS 26; feature anterior ao lote de 2026). A página do YNAB Together menciona um widget para "checar o plano antes de gastar" — [YNAB Updates](https://support.ynab.com/updates-to-ynab-S1f4aRLeC); [YNAB Subscription Sharing](https://www.ynab.com/features/subscription-sharing)
- **Entrada rápida por IA:** Finny, rastreador para iPhone com entrada por IA, grátis ou US$24,99/ano (é também autor de reviews, então há conflito de interesse) — [pocketclear roundup](https://pocketclear.app/blog/best-expense-tracker-app-2026.html)

### Inferences
- Para um app manual, a entrada rápida é crítica para retenção: um widget com "lançar gasto", Shortcuts/Siri e um campo de texto livre interpretado por IA ("mercado 230 cartão") cobrem esse ponto.

### Gaps
- Não achei fontes sobre Live Activities, nem sobre widgets/Watch de Monarch, Lunch Money, Emma, Spendee ou Wallet.

## 6. Changelogs: o que foi lançado em 2025–2026 (por app)

### Takeaway
Os ciclos de produto mais intensos em 2026 foram Monarch (tier Plus, forecasting, mobile reports, goals, recibos, treemaps), YNAB (Card Mode, CSV import, Hide Amounts), Copilot (web, Money Assistant/MCP, totais) e Actual (Sankey, forecast, automations UI). Tiller fez um "Summer 2026 Update". Emma e Realbyte tiveram atualizações pequenas.

### Cited Findings
- **Monarch 2026:** tier Plus (US$199/ano); Forecasting (abr), múltiplos cenários (jun), lado a lado (jul); mobile reports com Sankey (jun); Goals redesenhado (jun); encaminhamento de e-mail/recibos (jul); treemaps (jul e ago); weekly recap e AI Assistant (Winter Release); Shared Views (fim de 2025); refresh de marca — [Monarch blogs](https://www.monarch.com/blog/june-product-update); [Monarch July](https://www.monarch.com/blog/july-product-update); [Monarch brand refresh](https://www.monarch.com/blog/monarch-brand-refresh); [Centinel](https://www.centinelmoney.com/resources/centinel-vs-monarch-money)
- **YNAB 2026:** Hide Amounts na web (10/jun), para compartilhar prints sem mostrar valores; novas telas de transação (iOS 27/mai, Android 8/jul); File-Based Import redesenhado (ago–set); Card Mode (22/set); QR code de indicação no Android e trials estendidos para indicados (25/set). As datas nas páginas do YNAB são inconsistentes — [YNAB What's New](https://www.ynab.com/whats-new); [YNAB Updates](https://support.ynab.com/updates-to-ynab-S1f4aRLeC)
- **Copilot 2026:** app web (jan); Money Assistant beta (ago); MCP beta; running totals na busca do iOS (set); cores consistentes nas categorias no macOS; Multi-Select Summary (out, anunciado) — [9to5Mac](https://9to5mac.com/2026/01/01/copilot-money-brings-clarity-to-your-finances-now-on-the-web/); [Copilot Dispatch](https://www.copilot.money/dispatch); [Releasebot](https://releasebot.io/updates/copilot-money)
- **Actual 2026:** 26.5.0 (Sankey, Age of Money, Budget Analysis, temas); 26.6.0 (Balance Forecast, UI de automations, Crossover estável, temas customizados estáveis, fórmulas no lugar de templating). Uma v26.10.0 (13/out/2026) aparece num script de terceiros, não verificada — [Actual 26.5.0](https://actualbudget.org/blog/release-26.5.0/); [Actual 26.6.0](https://actualbudget.org/blog/release-26.6.0/); [community-scripts](https://community-scripts.org/scripts/actualbudget)
- **Tiller (jul–ago/2026):** Direct Fills, Console mobile, Data Cleanup, AutoCat Description Match e AI Suggest, Templates gerenciados pelo Console — [Tiller What's New 2026](https://tiller.com/whats-new-tiller-2026/)
- **Lunch Money mobile 2026:** 2.2.0 (27/jan), 2.4.0 (anexos), 2.5.1 (25/jun) — [Lunch Money Changelog](https://feedback.lunchmoney.app/changelog); [App Store](https://apps.apple.com/us/app/lunch-money/id6739028463)
- **PocketGuard:** Pace (mar/2026) — [PocketGuard blog](https://pocketguard.com/blog/pocketguard-vs-rocket-money/)
- **Emma:** a v1.45.0 (12/out/2026) traz só correções. Pagamentos e transferências entre contas passaram a ser opcionais, com limite por plano. As ferramentas de orçamento foram para trás do paywall (Which?). O plano Ultimate tem "Spaces" (orçamentos mais específicos), alertas de crédito e VPN — [aptoide](https://emma-emma-technologies-ltd.en.aptoide.com/app); [householdmoneysaving](https://www.householdmoneysaving.com/emma-app-review/); [Which?](https://www.which.co.uk/money/banking/banking-security-and-payment-methods/open-banking-budgeting-and-saving-apps-aLl3e0g9I7Ft)
- **Realbyte:** iOS 2.12.X (jul–out/2025, detalhes na seção 3). O índice cita um update iOS 2.13.X em mai/2026, sem conteúdo encontrado — [Realbyte Help](https://help.realbyteapps.com/hc/en-us/articles/48874290257433-iOS-2-12-X-Update-October-2025)
- **Indies (Product Hunt, 2026):** Lums (#11 orgânico no PH), Fathom (privacy-first, ledger local, importação de exportações bancárias, planejamento por metas), Pocket Clear (afirma 40 mil usuários e nota 4,9 na App Store em set/2026, autodeclarado) — [Product Hunt Budgeting](https://www.producthunt.com/categories/budgeting-and-expense-tracking); [pocketclear](https://pocketclear.app/blog/best-budget-apps-2026.html)

### Inferences
- Fathom (ledger local + importação de arquivo) é o concorrente indie mais parecido com um app sem Open Finance e merece benchmark direto.

### Gaps
- Não encontrei changelogs 2025–2026 de Spendee, Wallet, Rocket Money nem Simplifi (a Quicken não publica release notes nas buscas). Também não achei nenhum app de finanças em "Apps We Love" da App Store em 2025–2026.

## 7. Features mais elogiadas em reviews / UX "limpo e premium"

### Takeaway
Os elogios de design se concentram no Copilot ("extraordinariamente fácil e até agradável", Apple-first) e, para casais, no Monarch (Shared Views, logins separados). O Lunch Money é elogiado no desktop, e o YNAB, pela metodologia. As críticas recorrentes são: paywall (Emma), números de "safe to spend" errados (PocketGuard) e paridade incompleta entre web e mobile (Copilot, Monarch).

### Cited Findings
- **Copilot:** citado como "extraordinarily easy (and even enjoyable!) to track finances" e descrito por reviewers como o app de iPhone mais completo e bem acabado. A crítica é ser só Apple e a web ficar atrás do iOS — [busca citando 9to5Mac via review](https://9to5mac.com/2025/06/26/copilot-money-is-the-budgeting-app-youve-been-looking-for/); [walletgrower](https://walletgrower.com/blog/copilot-money-review-2026)
- **Monarch, para casais:** Shared Views (fim de 2025) marcam contas e transações como pessoal, do parceiro ou compartilhado em todo o dashboard, e cada membro tem seu login no mesmo plano. Um review de 4 anos de uso diário recomenda o app — [Centinel](https://www.centinelmoney.com/resources/centinel-vs-monarch-money); [marriagekidsandmoney](https://marriagekidsandmoney.com/monarch-money-review/)
- **YNAB Together:** até 5 vagas extras por assinatura (as páginas do YNAB divergem: "até 6 pessoas"). Cada membro tem login próprio, o orçamento do membro é sempre visível para o Group Manager e o compartilhamento com os demais é controlável — [YNAB Together](https://www.ynab.com/whats-new/introducing-ynab-together); [YNAB Features](https://www.ynab.com/features)
- **Lunch Money:** "melhor app de orçamento para desktop" (Forbes 2026); o mobile complementa a web, não a substitui — [Forbes Advisor](https://www.forbes.com/advisor/banking/best-budgeting-apps/)
- **Emma:** a Which? critica a migração das ferramentas de orçamento para planos pagos — [Which?](https://www.which.co.uk/money/banking/banking-security-and-payment-methods/open-banking-budgeting-and-saving-apps-aLl3e0g9I7Ft)
- **PocketGuard:** o "In My Pocket" é útil, mas pode errar no início; a Motley Fool recomenda cautela com o número — [Get Rich Slowly](https://www.getrichslowly.org/pocketguard-review/); [Motley Fool](https://www.fool.com/money/personal-finance/pocketguard-review)
- **YNAB Hide Amounts:** permite compartilhar telas sem expor valores — [YNAB What's New](https://www.ynab.com/whats-new)

### Inferences
- Padrões "premium" recorrentes: cores de categoria consistentes em todas as telas (correção explícita do Copilot no macOS em 2026), totais ao vivo, celebração ao atingir marcos (quitação de dívida no YNAB), modo de ocultar valores e recap periódico em linguagem natural.
- Para casais, o diferencial mais citado é atribuir dono a cada transação (meu, seu, nosso) sem perder a visão consolidada, como no Shared Views do Monarch.

### Gaps
- Não consegui extrair citações diretas de reviews de usuários na App Store nem notas por app, porque a leitura de páginas estava bloqueada. Spendee, Wallet e Realbyte não tiveram elogios de UX verificados.
