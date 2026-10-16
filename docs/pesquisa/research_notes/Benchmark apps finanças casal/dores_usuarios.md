# Dores e necessidades de usuários de apps de finanças pessoais (2024–2026): Brasil x Internacional

> Nota de método (ler antes): a busca na web funcionou, mas o WebFetch não resolveu DNS para a maioria dos domínios (reclameaqui.com.br, apps.apple.com, reddit mirrors, choosefi.com, producthunt.com). Só o github.com abriu. Por isso, quase todas as citações abaixo vêm de **snippets de busca** (títulos e trechos de Reclame Aqui, artigos e boards), não da leitura da página inteira. Não consegui ler threads do Reddit diretamente (r/financaspessoais, r/ynab, r/MonarchMoney etc.), nem as avaliações da Play Store ou da App Store. As contagens de "frequência do tema" valem só para as fontes que encontrei (cerca de 20 buscas e fetches), não para todo o universo de reviews.
>
> Legenda de frequência: **[N fontes]** = número de fontes/relatos independentes encontrados com o tema. "Anedota" = 1 relato.

---

## Ranking consolidado (resumo para priorização)

### Brasil (ordenado pela frequência nas fontes encontradas)
1. **A fatura do cartão aparece errada: valor, data de fechamento, parcelas futuras somadas na fatura atual** [8+ títulos de Reclame Aqui sobre o Mobills e 1 review de loja]. É a dor nº 1 e quase toda vem da sincronização via Open Finance.
2. **Lançamentos duplicados na importação ou sincronização** [3 relatos Mobills: até "8 vezes repetidas"].
3. **Erros ao tratar parcelas: editar ou categorizar todas, antecipar parcelas, compra parcelada somada pelo valor total** [3 relatos].
4. **Suporte inexistente ou demorado, mesmo para quem paga o Premium** [5+ relatos].
5. **A importação de OFX/CSV falha ou não está disponível: banco não gera OFX de cartão, limite de 6 meses, arquivo convertido não é lido** [3 fontes].
6. **Paywall: na versão grátis, 1 conta só e sem sincronização; importação de extrato só no Premium** [2 fontes de listas/review].
7. **Dar suporte a cartão é mais difícil que a conta-corrente: data de fechamento, pagamento da fatura ligado à conta** [1 relato no GitHub do Actual, de um usuário BR].
8. Pix, cartões adicionais, fatura futura e uso por casal: **não achei relatos específicos**. Ver Gaps.

### Internacional
1. **Fadiga de lançar à mão, ou o app virando "tarefa"** [4 fontes: thread estilo Reddit, ChooseFI, FICO forum, Product Hunt].
2. **Preço ou assinatura que não compensa** [2–3 fontes: YNAB a US$109 "não vale para quem lança manualmente"].
3. **Falhas e atrasos de sincronização bancária** [3 fontes: Blind sobre Monarch, Actual com GoCardless descontinuado e "transações deletadas que voltam"].
4. **Uso multiusuário ou por casal** [Actual: "Add user support" e "Multi-user Support" entre os mais reagidos; apps de casal destacam compartilhamento seletivo e "yours/theirs/ours"].
5. **Relatórios customizáveis e previsão (forecasting)** [Actual "Custom Reports", Sankey, export CSV; o YNAB é criticado por fraqueza em forecast].
6. **Conciliação e casamento de transações (merge, lock por reconciliação, regras)** [Actual: vários itens no topo].
7. **Lançamento rápido no mobile** [Actual: "Adding transactions on responsive mobile", 26 reações].
8. **Calculadora de dívidas (snowball)** [Lunch Money: 105 votos, o item mais votado que encontrei].

---

## 1. O que faz as pessoas abandonarem apps de finanças?

### Takeaway
No internacional, o abandono vem de **fadiga de lançamento manual ou "chore"** e de **preço que não compensa** quando o app não automatiza. No Brasil, a evidência aponta para **perda de confiança nos números**: fatura e saldo errados, duplicações, sincronização quebrada. Isso vem somado a suporte ruim. Os poucos reports de "categorias demais" ou "complexidade" que achei são anedóticos.

### Cited Findings
**Internacional**
- Numa thread sobre por que é difícil manter o controle de gastos, um usuário trocou o app por papel e caneta porque "the value proposition just wasn't there". Outro disse que o mais difícil era "getting started and updating the spending categories". Um terceiro chamou o controle de gastos de "drudge" e sugeriu ligar o cartão a um app (2025-12, snapshot de Reddit via snippet). — [Reddit snapshot](https://reddit.sentinel-team.org/posts/1pp2tk7/snapshots/2025-12-18T23%3A51%3A31.88221Z)
- Um usuário largou o YNAB porque US$109 + impostos não valia a pena para quem lança manualmente e nunca ligou contas bancárias. — [ChooseFI forum](https://choosefi.com/forums/spending-smarter/i-finally-ditched-ynab)
- "The only annoyance was having to manually add things when I charged something on a card" (sem data, provavelmente anterior a 2024). — [myFICO forums](https://ficoforums.myfico.com/t5/Personal-Finance/Budget-apps-vs-spreadsheet/m-p/5566659)
- Uma thread no Product Hunt ("money app you rage-quit") descreve a ferramenta que "slowly turned into a chore… one day they just stopped opening it". — [Product Hunt](https://www.producthunt.com/p/general/what-s-the-money-app-you-rage-quit-and-what-finally-did-it)
- Sync: usuário do Monarch diz que "doesn't seem to update as often, even when forcing a refresh" (Blind, contexto do fim do Mint, 2024). — [Blind](https://www.teamblind.com/post/mint-was-discontinued-on-jan-1st-2024-7vpa2zr1)
- Um número que circula, "78% dos usuários desistem em 3 meses" (atribuído ao Journal of Financial Planning via AceShowbiz), **não pôde ser verificado**. Não usar. — [AceShowbiz](https://www.aceshowbiz.com/news/view/00260316.html)

**Brasil**
- Reclame Aqui do Mobills, títulos recorrentes: "Erros sem fim. TODO mês o mesmo problema"; "Aplicativo cheio de bugs, problemas e inconsistências"; "Solução repleta de bugs e atendimento inexistente mesmo para pagantes"; "A plataforma web da Mobills está cada vez com mais erros"; "O MARKETING DELES É OTIMO, MAS O APP É HORRÍVEL PARA MIM". — [RA 1](https://www.reclameaqui.com.br/mobills-educacao-financeira/erros-sem-fim-todo-mes-o-mesmo-problema_F3gHCczljV6IMjAZ/), [RA 2](https://www.reclameaqui.com.br/mobills-educacao-financeira/aplicativo-cheio-de-bugs-problemas-e-inconsistencias__kUR_nxPf5bpTBtq/), [RA 3](https://www.reclameaqui.com.br/mobills-educacao-financeira/solucao-repleta-de-bugs-e-atendimento-inexistente-mesmo-para-pagantes_gIC7vRMi5-naSHxn/), [RA 4](https://www.reclameaqui.com.br/mobills-educacao-financeira/a-plataforma-web-da-mobills-esta-cada-vez-com-mais-erros_RGGxwxqE-J1-zeHl/), [RA 5](https://www.reclameaqui.com.br/mobills-educacao-financeira/o-marketing-deles-e-otimo-mas-o-app-e-horrivel-para-mim_HCAnYWCE1flUyMLf/)
- Divergências de saldo e falta de suporte: "Problemas recorrentes no aplicativo Mobills/Mobius: divergências de saldo, erro de cadastro e falta de suporte efetivo". — [RA](https://www.reclameaqui.com.br/mobills-educacao-financeira/problemas-recorrentes-no-aplicativo-mobillsmobius-divergencias-de-saldo-erro-de-cadastro-e-falta-de-suporte-efetivo_rAeHM43kA4roY07a/)
- Um usuário Premium relata mais de 60 dias sem resposta: depois de ativar o Open Finance, sincronizou a conta Itaú mas não o cartão. — [RA](https://www.reclameaqui.com.br/mobills-educacao-financeira/problemas-de-sincronizacao-e-funcionalidades-apos-ativacao-do-open-finance-na-conta-premium-mobills_ZUZD-DDnkifO6ofj/)
- Caso de 2024 resolvido com reembolso: a empresa "informaram que não vão conseguir resolver os problemas apontados e não tem previsão" (snippet de busca; a data é a indicada no resumo). — [RA](https://www.reclameaqui.com.br/mobills-educacao-financeira/fatura-do-cartao-de-credito-incorreta-apos-open-finance-e-dificuldade-no-atendimento-para-reembolso-do-plano-premium_XPuMAgmBISiudvqI/)
- Paywall: na versão grátis do Mobills, "limite de uma conta cadastrada". O Premium desbloqueia Open Finance, metas, relatórios e **importação de extratos**. No Organizze, sincronização entre dispositivos e alguns relatórios são premium. — [TechTudo 2026](https://www.techtudo.com.br/listas/2026/01/10-apps-de-controle-financeiro-para-cuidar-melhor-do-dinheiro-em-2026-edapps.ghtml), [iDinheiro](https://www.idinheiro.com.br/financaspessoais/app-controle-financeiro-pessoal-gratis/)
- Segundo o snippet de busca, a página do Mobills no Reclame Aqui exibe o selo "Não recomendada". Não pude abrir a página para confirmar a nota atual. — [RA lista Mobills](https://www.reclameaqui.com.br/mobills-educacao-financeira/fatura-em-aberto-e-com-valor-errado_IM_wTr9kQJp81gt0/)
- Organizze: nota 4,2 (Android) e 4,6 (iOS) e "nota ótima no Reclame Aqui", segundo uma lista sem data clara. — [Creditas/iDinheiro via busca](https://www.creditas.com/exponencial/aplicativo-controle-financeiro/)

### Inferences
- Para um app **sem Open Finance**, a dor nº 1 do Brasil (sincronização errada) vira oportunidade: importar PDF/OFX com uma **tela de revisão determinística** ("o que entrou, o que é duplicado, a qual fatura pertence") pode ser a promessa central, algo como "números que batem com a fatura do banco".
- Sem automação bancária, a fadiga de lançamento (dor nº 1 internacional) é o maior risco de abandono. O importador de fatura precisa ser rápido (poucos toques por mês). O lançamento manual rápido no mobile, para Pix e dinheiro, também é crítico.
- O preço só é aceito quando o app poupa trabalho. Quem lança manualmente não quer pagar (caso do YNAB).

### Gaps
- Não achei evidência quantitativa de "categorias demais" como causa de abandono, só uma menção a "updating the spending categories" como chato.
- Não consegui ler reviews da Play Store ou da App Store de Mobills, Organizze, Minhas Finanças e Olivia (os domínios ficaram inacessíveis).
- Não há taxa de churn confiável e verificável.

---

## 2. Dores específicas de cartão de crédito no Brasil (parcelas, fechamento/vencimento, faturas futuras, adicionais, Pix)

### Takeaway
As reclamações concretas se concentram em **fatura com valor errado**, **data de fechamento errada**, **parcelas futuras caindo na fatura atual**, **edição de parcelas que não se propaga** e **antecipação de parcelas que bagunça o limite**. Sobre cartões adicionais e Pix não achei relatos.

### Cited Findings
- "Venho encontrando problemas recorrentes de inconsistências em valores constantes nas faturas e inclusive **erro da data de fechamento da fatura**". O suporte por WhatsApp "leva ao robô". — [RA: Problema persistente de inconsistências em faturas](https://www.reclameaqui.com.br/mobills-educacao-financeira/problema-persistente-de-inconsistencias-em-faturas_ne7sH1vvVqJA-2ot/)
- "Quando fiz o vínculo no Itaú via open finance, a fatura do cartão de crédito veio muito diferente da realidade. **Vieram várias parcelas futuras como se fosse atual**." — [RA: Fatura incorreta após Open Finance](https://www.reclameaqui.com.br/mobills-educacao-financeira/fatura-do-cartao-de-credito-incorreta-apos-open-finance-e-dificuldade-no-atendimento-para-reembolso-do-plano-premium_XPuMAgmBISiudvqI/)
- Nubank no Mobills: fatura fechada com valores e nomes errados; "não sincroniza as alterações feitas no app Nubank". — [RA: Fatura em aberto e com valor errado](https://www.reclameaqui.com.br/mobills-educacao-financeira/fatura-em-aberto-e-com-valor-errado_IM_wTr9kQJp81gt0/)
- "O app pergunta se desejo aplicar à todas as parcelas, mas mesmo eu marcando que sim, **ele só aplica na fatura atual**." — [RA: Problemas com valores incorretos](https://www.reclameaqui.com.br/mobills-educacao-financeira/problemas-com-valores-incorretos-no-aplicativo-mobills_uvwaZlapED3UxfBJ/)
- "O Mobills antecipou as parcelas porém ocorreu um erro pós antecipação que **resgatou algumas parcelas já pagas a quase um ano e jogou em faturas futuras**", o que desajustou o limite. — [RA: Erro ao antecipar parcelas](https://www.reclameaqui.com.br/mobills-educacao-financeira/erro-ao-antecipar-parcelas_sBC22KdMMeW5v3SN/)
- Review de loja (via agregador): "às vezes aparece um valor de fatura pq **soma uma compra que foi parcela como se fosse total** e só quando fecha a fatura que ajusta". — [mwm.ai (reviews Mobills)](https://mwm.ai/apps/mobills-budget-planner/921838244)
- Duplicação: "em alguns casos aparece 8 vezes repetidas no extrato" (marcado como resolvido, com solução paliativa). Outro caso de saldo duplicado ficou anos sem solução; a empresa respondeu "Estamos passando por uma melhoria na sincronização". — [RA: Importação automática duplicada](https://www.reclameaqui.com.br/mobills-educacao-financeira/importacao-automatica-com-transacoes-duplicadas_IjXygDgZnLXV4LBS/), [RA: Saldo incorreto, duplicados](https://www.reclameaqui.com.br/mobills-educacao-financeira/saldo-incorreto-lancamentos-importados-duplicados_hJhDl1Y3AvpmwZF1/)
- OFX: "Tenho Cartão de Crédito na CAIXA, e não geram OFX". Outros títulos: "Não importa dados .ofx nem .csv nem sincroniza com BB"; "Integrações e importação de extrato quebradas". — [RA 1](https://www.reclameaqui.com.br/mobills-educacao-financeira/nao-importa-dados-ofx-nem-csv-nem-sincroniza-com-bb_Moql-Jn5hXAGKizV/), [RA 2](https://www.reclameaqui.com.br/mobills-educacao-financeira/integracoes-e-importacao-de-extrato-quebradas_GfJSF_h2s2TN_tK5/)
- Limitações oficiais do Mobills: lê só arquivos "originados de bancos" (não convertidos) e importa no máximo 6 meses para trás. — [Mobills Help: não consigo importar OFX](https://mobills.zendesk.com/hc/en-us/articles/360052620713-I-cannot-import-my-bank-files-OFX)
- O Organizze importa OFX só para contas e cartões **manuais**, com tela de revisão e uma "conciliação bancária" que sugere correspondências para evitar duplicidade. É o padrão de mercado a igualar. — [Organizze Ajuda: importar OFX](https://ajuda.organizze.com.br/hc/pt-br/articles/5994104693395-Web-Lan%C3%A7amentos-Importar-arquivo-OFX), [Organizze: conciliação](https://ajuda.organizze.com.br/hc/pt-br/articles/5994220061203-Web-Lan%C3%A7amentos-Concilia%C3%A7%C3%A3o-banc%C3%A1ria)
- Usuário BR no GitHub do Actual Budget (2024-12 a 2025-03): o Actual "doesn't ask for statement closing dates or link bill payments to accounts", o que deixa o cartão "a bit more troublesome to handle… than I expected". Também aparecem: "anything that keeps me from uploading CSVs is good", "simplefin does not work in Brazil" e preocupação de privacidade com o Pluggy ("I don't feel so comfortable exposing all my financial information to pluggy"). — [actualbudget/actual#3995](https://github.com/actualbudget/actual/issues/3995)
- O app "Minhas Contas" usa como argumento de venda o cálculo automático de parcelas futuras e recorrências ("O app gerencia automaticamente as próximas parcelas"). Isso sugere que é uma expectativa básica. — [App Store: Minhas Contas](https://apps.apple.com/br/app/id1556730522)

### Inferences
- Modelo de dados obrigatório: **compra parcelada como entidade única com N parcelas**, cada uma atribuída à fatura certa pela data de fechamento. Editar a categoria propaga para todas. Antecipar parcelas é suportado de forma explícita. Isso ataca as três dores mais citadas.
- **Data de fechamento e vencimento configurável por cartão**, com a regra "compra após o fechamento vai para a próxima fatura", e uma **visão de faturas futuras** (parcelas já comprometidas nos próximos meses). Nenhuma reclamação pede isso com essas palavras, mas os erros relatados ("parcelas futuras como se fosse atual") mostram que é aí que os concorrentes falham.
- Importar PDF/OFX da fatura **conciliando com parcelas já conhecidas**: a parcela 3/10 importada casa com a parcela prevista, em vez de duplicar. Isso responde à dor de duplicação.
- Precisa existir um caminho para bancos sem OFX de cartão (Caixa): o PDF é o diferencial.
- A privacidade ("sem Open Finance, sem agregador") pode virar argumento de venda para um nicho, com base no comentário sobre o Pluggy (anedota).

### Gaps
- **Pix**: nenhuma reclamação ou pedido encontrado sobre Pix em apps de finanças (nem Pix parcelado ou Pix no crédito).
- **Cartões adicionais** (comum em casais: titular + adicional do cônjuge): nenhum relato encontrado. Vale pesquisar em fóruns direto.
- **Ver faturas futuras**: nenhum pedido explícito encontrado, só inferido dos erros.
- Não consegui acessar o Reclame Aqui do Organizze, Olivia, Minhas Finanças, Guiabolso (descontinuado) etc. As reclamações acima são quase todas do Mobills, o que distorce o retrato (é o app mais popular com Open Finance).
- Muitos casos do Reclame Aqui não têm data visível no snippet. Alguns podem ser de antes de 2024 (o resumo da busca avisa que "algumas [têm] mais de três anos").

---

## 3. Funcionalidades mais pedidas em boards públicos (YNAB, Monarch, Copilot, Actual, Lunch Money)

### Takeaway
Só consegui dados de votos do **Actual Budget** (GitHub) e do **Lunch Money** (Canny). Os temas que se repetem são **multiusuário/compartilhamento**, **relatórios customizáveis**, **conciliação e merge de transações**, **lançamento mobile**, **regras** e **dívidas (snowball)**. Para o YNAB, o pedido "mais visto" segundo um usuário veterano é carregar déficit para o mês seguinte. Os boards do Monarch e do Copilot não foram encontrados.

### Cited Findings
- **Actual Budget**: issues com label "feature" ordenadas por 👍. A página mostrou números que parecem reações, mas a ordenação aparentou ser inconsistente, então trate como aproximado. Todas as listadas estão fechadas (implementadas ou triadas):
  - "[Feature] Open Banking from Brazil" (#3995): 42
  - "[Feature] Adding transactions on responsive mobile" (#604): 26
  - "[Feature] Add user support to Actual" (#524): 25
  - "[Feature] Reconcilliation to Lock Transactions" (#558): 23
  - "[Feature] Custom Reports" (#730): 21
  - "[Feature] Merge unmatched transactions" (#669): 20
  - "Multi-user Support" (#1091): 9; "Remember already synced transactions so they don't respawn if deleted" (#2289): 9; "Display category balance when assigning transaction" (#534): 9
  - "[Feature] Translation" (#497): 7; "Ability to disable automatic rules" (#2515): 7; "Manually categorise transactions as Upcoming" (#514): 7
  - Outros: Sankey report, export CSV, multi-currency, combined transaction list on mobile, GPS para sugerir categoria.
  — [GitHub actualbudget/actual, issues ordenadas por 👍](https://github.com/actualbudget/actual/issues?q=is%3Aissue+sort%3Areactions-%2B1-desc+label%3Afeature)
- A documentação do Actual incentiva contribuidores a trabalhar nas "highest rated feature requests". — [Actual docs: contributing](https://actualbudget.com/docs/contributing)
- **Lunch Money** (Canny): "Built-in debt payoff/snowball calculator" com 105 votos (criado em 2021-01, comentário de 2025-08 dizendo que está "on the radar" há muito tempo). "Option to open View Transactions links in same tab": 59 votos (2024-12). O board foi lançado em out/2024 com pedidos antigos migrados. — [Lunch Money: debt snowball](https://feedback.lunchmoney.app/general-feature-request/p/built-in-debt-payoffsnowball-calculator), [Lunch Money: same tab](https://feedback.lunchmoney.app/general-feature-request/p/option-to-open-view-transactions-links-in-same-tab)
- **YNAB**: o pedido "probably the feature I see requested most often on Reddit or other forums" por veteranos é a volta do "red arrow right", que carregava o déficit para o mês seguinte. Forecasting aparece como ponto fraco. — [Fortune: YNAB pros and cons](https://fortune.com/article/ynab-pros-and-cons)
- **Monarch**: não achei o board de votos. A página oficial descreve households com convidados, login próprio e dados compartilhados sob uma assinatura só. A Motley Fool diz até 5 membros. — [Monarch Help: Couples and Households](https://help.monarch.com/hc/en-us/articles/20926382202004-Monarch-for-Couples-and-Households), [Motley Fool](https://www.fool.com/the-ascent/personal-finance/monarch-money-review)
- **Apps de casal**: Honeydue permite limitar o que cada um compartilha e é criticado por "limited ability to plan for future spending" e por não ter versão desktop. O Partner Mode do Origin tem toggles "yours, theirs, and ours" e compartilhamento só das contas que cada um escolhe. Apps novos oferecem divisão 50/50 ou proporcional à renda. — [NerdWallet: Honeydue](https://www.nerdwallet.com/finance/learn/honeydue-app-review), [Fortune: Origin Partner Mode](https://fortune.com/article/origin-partner-mode-budget-couples), [Nasdaq: apps para casais](https://www.nasdaq.com/articles/5-budgeting-apps-for-couples-with-shared-financial-goals)

### Inferences
- Para um app de casal, os pedidos recorrentes de **multiusuário** (Actual), **"yours/theirs/ours"** e **compartilhamento seletivo** (Origin, Honeydue) indicam que privacidade parcial entre os parceiros é um requisito, não um extra.
- **Planejamento de gastos futuros** é uma lacuna citada no Honeydue e no YNAB (forecast). Isso conversa com "faturas futuras e parcelas" no Brasil.
- **Conciliação e lock** e **não ressuscitar transações deletadas** são exatamente o que um importador de PDF/OFX precisa (idempotência).
- O "Translation" do Actual e o "Open Banking Brazil" no topo mostram demanda brasileira até em ferramentas gringas de nicho.

### Gaps
- Boards do YNAB, Monarch e Copilot: nada indexado com votos. Não sei se o Monarch ou o Copilot têm board público.
- As contagens do Actual foram lidas da página renderizada e não pela API (a API de busca do GitHub estava bloqueada nesta sessão). Podem ser outra métrica.

---

## 4. O que usuários do Reddit dizem amar no app atual

### Takeaway
Evidência fraca, porque não consegui ler o Reddit diretamente. Nos fragmentos encontrados, os elogios vão para **realocar dinheiro e categorias flexíveis (YNAB)**, **widgets e visão compartilhada do casal (Monarch)**, **importar o histórico via CSV** e **preço grátis com recursos de casal (Honeydue)**.

### Cited Findings
- YNAB: os pontos fortes citados em reviews são "ability to reallocate funds" e "category customization". A comunidade cria extensões "não oficiais" para ganhar flexibilidade. — [Fortune](https://fortune.com/article/ynab-pros-and-cons), [Nasdaq 2025](https://www.nasdaq.com/articles/10-best-budgeting-apps-2025-stay-control-your-finances)
- Monarch: um usuário que testou o Copilot e o Monarch achou o Monarch "clearly better". Elogios a widgets de iOS com categorias e transações recentes, e à importação do histórico do Mint via CSV. Ao mesmo tempo, o sync é mais lento ("doesn't seem to update as often"). Opinião mista. — [Blind: Empower vs Monarch vs Copilot](https://www.teamblind.com/post/empower-per-vs-monarch-vs-copilot-dg33qmaw), [Blind: Mint discontinued](https://www.teamblind.com/post/mint-was-discontinued-on-jan-1st-2024-7vpa2zr1)
- Copilot: comentários duros ("essentially garbage") e a crítica antiga de ser só para iOS. Anedota. — [Blind](https://www.teamblind.com/post/empower-per-vs-monarch-vs-copilot-dg33qmaw)
- Honeydue: o sentimento no Reddit é misto, com elogios ao preço grátis e aos recursos de casal (segundo a NerdWallet). — [NerdWallet: Honeydue](https://www.nerdwallet.com/finance/learn/honeydue-app-review)
- Monarch: casal com logins separados sob uma assinatura e um membro extra sem custo adicional, um ponto frequentemente citado em reviews. — [NerdWallet: Monarch](https://www.nerdwallet.com/finance/learn/monarch-money-app-review)

### Inferences
- Os atributos que se repetem como "amor" são **flexibilidade** (realocar, categorias próprias), **visão conjunta sem pagar dobrado** e **saída fácil dos dados (CSV)**. Para o Brasil, um app de casal com **uma assinatura para os dois** e **exportação aberta** segue esse padrão.

### Gaps
- Não consegui acessar r/ynab, r/MonarchMoney, r/CopilotMoney, r/personalfinance, r/povertyfinance, r/financaspessoais, r/investimentos ou r/brdev diretamente (o fetch falhou e a busca não retornou threads). **Não há citações diretas do Reddit brasileiro.** Recomendo uma rodada manual ou com outra ferramenta de acesso.
- O Tecnoblog Comunidade não foi coberto.
