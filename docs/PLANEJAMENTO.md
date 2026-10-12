# Planejamento — App de finanças do casal

Documento vivo. Toda mudança de escopo ou decisão de arquitetura é registrada aqui antes de virar código.

## 1. Premissas

| Decisão | Motivo |
|---|---|
| **Entrada principal: PDF da fatura Santander** | É o fluxo que já é feito manualmente todo mês e onde está o valor (conferência de total, parcelas, encargos). |
| **Sem Open Finance (Pluggy) por enquanto** | Não há protótipo existente; o PDF resolve o caso principal sem custo nem contrato. Pode entrar no futuro pela mesma tabela `transactions`. |
| **Sem chamadas a APIs de IA** | Custo zero, previsível e privado. Extração e categorização são determinísticas (leitor de layout + dicionário + regras). |
| **IA só opcional e iniciada pelo usuário** | Formato de importação "JSON de lançamentos": se o leitor falhar com uma fatura, o usuário pode processá-la no próprio Claude e colar o resultado; o app aplica a mesma conferência. O app nunca chama IA sozinho. |
| **Valores em centavos (`bigint`)** | Sem erro de arredondamento. Formatação só na borda: `R$ 1.234,56`, `dd/mm/aaaa`. |
| **Mobile-first, até 3 toques para corrigir algo** | Requisito de UX. |

## 2. Stack

| Camada | Escolha | Observação |
|---|---|---|
| App | **Expo (React Native + TypeScript) + Expo Router** | Testável no **Expo Go** na Fase 1. |
| Gráficos | **react-native-gifted-charts** | Funciona no Expo Go (rosca, barras empilhadas). Victory Native exige Skia/dev build. |
| Backend | **Supabase**: Auth (e-mail com código), Postgres + RLS, Storage privado, Edge Functions | Plano gratuito atende um casal. |
| Lógica de domínio | **`packages/core`** em TypeScript puro | Sem React e sem Supabase; roda no app, na Edge Function e nos testes. |
| Testes | **Vitest** (core) + testes SQL de RLS | Fixtures de fatura anonimizada. |
| Monorepo | **pnpm workspaces** | Simples; sem Turborepo/Nx por enquanto. |

Push notifications: desde o SDK 53 o Expo Go não recebe push remoto no Android → push fica para a Fase 2 com **development build (EAS)**.

## 3. Estrutura de pastas

```
apps/mobile/
  app/
    (auth)/entrar.tsx, convite/[token].tsx
    (tabs)/inicio.tsx        dashboard do mês
    (tabs)/importar.tsx      upload + histórico de faturas
    (tabs)/revisar.tsx       fila de baixa confiança
    (tabs)/mais.tsx          parcelas, recorrências, casal, ajustes
    fatura/[id]/conferir.tsx tela de conferência antes de salvar
    lancamento/[id].tsx
  src/components/  charts/, CategoryChip, TransactionRow, MoneyText
  src/lib/         supabase.ts, format.ts, queries/
packages/core/src/
  money.ts           parse "1.234,56" ↔ centavos, formatação BRL
  dates.ts           dd/mm, inferência de ano pela data de fechamento
  normalize.ts       limpeza de descrição (prefixos, cidade, espaços)
  parsers/
    types.ts         ParsedStatement, ParsedTransaction
    pdf-lines.ts     itens de texto com posição (x, y) → linhas/colunas
    santander/       leitor da fatura Santander
    ofx.ts, csv.ts   (fim da Fase 1, se o banco exportar)
    json-import.ts   formato aberto para importação assistida
  reconcile.ts       soma = total; parcelas futuras = obrigações futuras
  categorize.ts      dicionário → regras → "Revisar"
  dedupe.ts          hash de deduplicação
  installments.ts    linha do tempo de parcelas futuras
  recurring.ts       detecção de assinaturas/recorrências
  seeds/merchants.ts dicionário inicial (IFD*, MP*, ZP*, CAPPTA*…)
supabase/
  migrations/        schema, RLS, seeds
  functions/parse-statement/   baixa PDF → extrai texto → core → rascunho
  tests/             testes de RLS
fixtures/santander/  texto extraído anonimizado + expected.json
docs/                este planejamento, decisões, guia de teste no celular
```

## 4. Fluxo principal: importação de fatura PDF

```
[App] escolher PDF ─► upload p/ bucket privado  statements/{household_id}/{uuid}.pdf
        │                  (sha256 calculado → barra fatura repetida)
        ▼
[Edge Function parse-statement]
   1. baixa o PDF (service role, só dentro da função)
   2. extrai itens de texto com posição (pdf.js/unpdf); pede senha se protegido
   3. core/parsers/santander → ParsedStatement
   4. core/categorize + dedupe + reconcile
   5. grava statement (status = needs_review) + transações em rascunho
        ▼
[App] Tela de conferência
   ✔ soma bate com o total     → botão "Confirmar fatura"
   ✘ diferença de R$ X         → mostra diferença, linhas suspeitas,
                                  permite editar/adicionar/excluir antes de confirmar
        ▼
statement.status = confirmed  → entra no dashboard
```

### 4.1 Leitor Santander (determinístico)

- Trabalha sobre **linhas reconstruídas por posição** (y agrupa a linha, x separa colunas: data | descrição | parcela | US$ | R$). Isso desacopla o leitor da biblioteca de PDF: os fixtures guardam essas linhas, não o PDF.
- Extrai do cabeçalho/resumo: data de fechamento, vencimento, **total da fatura**, saldo anterior, pagamentos/créditos, **saldo de obrigações futuras / compras parceladas próximas faturas**, cotação do dólar.
- Extrai por bloco de cartão (titular e adicional, identificados pelo **final do cartão**): data, descrição, parcela `NN/TT`, valor US$, valor R$.
- Classifica `kind`:
  - `pagamento`: "PAGAMENTO DE FATURA…" (fora da soma de gastos)
  - `estorno`: créditos/estornos (valor negativo)
  - `encargo`: anuidade, IOF, juros, multa, seguro, tarifa
  - `parcela`: tem `NN/TT` com TT > 1
  - `avista`: demais
- Ano da data: a fatura traz só `dd/mm`; infere-se o ano pela data de fechamento (compra em dezembro numa fatura de janeiro → ano anterior). Parcelas usam a data da compra original.
- **O layout exato só será fechado com um PDF real.** Os nomes de seções acima são hipóteses a confirmar.

### 4.2 Conferência (o coração do produto)

Duas verificações, ambas exibidas na tela de conferência e cobertas por testes:

1. **Soma = total**
   `saldo_anterior − pagamentos_créditos + Σ(lançamentos do período, inclusive encargos e estornos) = total_da_fatura`
   Com fallback para `Σ lançamentos = total de despesas do período`, conforme o que o PDF declarar.
2. **Parcelas futuras = obrigações futuras**
   `Σ (total − n) × valor_parcela`, para cada parcela da fatura = `saldo de obrigações futuras` declarado.

Tolerância: 0 centavos. Qualquer diferença bloqueia a confirmação automática e pede revisão (o usuário pode confirmar mesmo assim, registrando a diferença).

### 4.3 Deduplicação

- `file_sha256` único por household → a mesma fatura não entra duas vezes.
- `dedupe_hash = sha256(account_id | data | valor_centavos | descrição_normalizada | parcela n/t | ordinal)`.
  O **ordinal** diferencia compras idênticas legítimas no mesmo dia (dois cafés iguais).
- A parcela 3/10 de março e a 4/10 de abril são lançamentos diferentes (n difere); a mesma 3/10 vinda de uma reimportação colide e é descartada.

## 5. Categorização em camadas (sem IA)

```
descrição original ─► normalize ─► 1. regras do household (prioridade, mais específicas)
                                   2. dicionário de merchants (household > global)
                                   3. heurísticas por ramo (POSTO → combustível, DROGARIA → saúde…)
                                   4. sem match → categoria "Outros", confiança baixa → fila Revisar
```

> Regras do usuário vêm **antes** do dicionário: se o casal decidiu que "MP*FULANO" é Casa, isso vence o padrão global.

- **Decodificação de prefixos** (`seeds/merchants.ts`): `IFD*` iFood, `MP*` Mercado Pago (o nome após o `*` é o vendedor real), `ZP*` Zoop, `CAPPTA*` maquininha, `PAG*`/`PAGSEGURO*`, `SUMUP*`, `STONE*`, `EC*`, `PG*`, `UBER*`/`UBER TRIP`, `99*`, `NETFLIX`, `SPOTIFY`, `AMAZON`, `GOOGLE*`, `APPLE.COM/BILL` etc. Para intermediadores (MP*, ZP*, CAPPTA*), a descrição decodificada mostra o vendedor depois do prefixo, e a categoria vem da regra/dicionário desse vendedor.
- **Confiança**: alta (regra do usuário ou dicionário "alta"), média (dicionário "média" ou heurística), baixa (sem match ou intermediador sem vendedor conhecido) → **Revisar**.
- **Correção em até 3 toques**: tocar no lançamento → escolher categoria → "Sempre para *VENDEDOR*" (padrão ligado). Isso cria/atualiza uma `rule` do household, reaplica a regra aos lançamentos pendentes iguais e vale para os dois.

## 6. Modelo de dados (rascunho SQL)

```sql
-- Casal
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now()
);
create table members (
  household_id uuid references households on delete cascade,
  user_id uuid references auth.users on delete cascade,
  display_name text not null,
  role text not null check (role in ('owner','member')),
  primary key (household_id, user_id)
);
create table invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  token text not null unique,          -- aleatório, uso único
  email text,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users
);

-- Contas e cartões
create table accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  kind text not null check (kind in ('checking','credit_card')),
  institution text not null,           -- 'santander'
  name text not null,                  -- 'Unique Visa'
  closing_day smallint, due_day smallint,
  source text not null default 'manual'
);
create table account_cards (            -- titular + adicional; só os 4 últimos dígitos
  account_id uuid references accounts on delete cascade,
  last4 char(4) not null,
  holder_user_id uuid references auth.users,
  primary key (account_id, last4)
);

-- Faturas
create table statements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  account_id uuid not null references accounts,
  closing_date date not null, due_date date not null,
  declared_total_cents bigint not null,
  declared_previous_balance_cents bigint,
  declared_payments_cents bigint,
  declared_future_cents bigint,        -- saldo de obrigações futuras
  computed_total_cents bigint not null,
  computed_future_cents bigint,
  usd_rate numeric(12,6),
  status text not null check (status in ('needs_review','confirmed')),
  file_path text not null, file_sha256 text not null,
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  unique (household_id, file_sha256)
);

-- Categorias fixas (seed)
create table categories (id smallint primary key, slug text unique, name text not null);
-- 1 mercado · 2 restaurante/delivery · 3 transporte/combustível · 4 assinaturas
-- 5 saúde · 6 casa · 7 compras/varejo · 8 lazer · 9 educação · 10 viagem
-- 11 serviços/tarifas · 12 outros

-- Dicionário e regras
create table merchants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households on delete cascade,  -- null = global (seed)
  pattern text not null,
  match_type text not null check (match_type in ('prefix','contains','regex')),
  real_name text not null, segment text,
  category_id smallint references categories,
  confidence text not null check (confidence in ('alta','media','baixa'))
);
create table rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  pattern text not null,
  match_type text not null check (match_type in ('prefix','contains','regex')),
  category_id smallint references categories,
  owner_user_id uuid references auth.users,   -- opcional: sempre "dela"/"meu"
  priority int not null default 100,
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now()
);

-- Lançamentos
create table transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  account_id uuid not null references accounts,
  statement_id uuid references statements on delete cascade,
  card_last4 char(4),
  posted_on date not null,
  description_raw text not null,
  description_clean text not null,
  amount_cents bigint not null,          -- + gasto, − estorno/crédito
  amount_usd_cents bigint, fx_rate numeric(12,6),
  installment_n smallint, installment_total smallint,
  kind text not null check (kind in ('avista','parcela','estorno','encargo','pagamento')),
  category_id smallint references categories,
  category_source text not null check (category_source in ('rule','merchant','heuristic','manual','none')),
  confidence text not null check (confidence in ('alta','media','baixa')),
  owner_user_id uuid references auth.users,   -- null = "nosso"
  is_private boolean not null default false,   -- Fase 2
  tax_deductible boolean not null default false, -- Fase 3
  attachment_path text,
  source text not null check (source in ('pdf','csv','ofx','json','manual')),
  dedupe_hash text not null,
  created_at timestamptz not null default now(),
  unique (household_id, dedupe_hash)
);

-- Fases 2 e 3 (tabelas já criadas, telas depois)
create table budgets (household_id uuid references households on delete cascade,
  category_id smallint references categories, month date, limit_cents bigint not null,
  primary key (household_id, category_id, month));
create table goals (id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  name text not null, target_cents bigint not null, saved_cents bigint not null default 0,
  due_date date);
```

**Dono**: guardado como `owner_user_id` (null = nosso), não como texto "meu/dela", porque "meu" depende de quem olha. O app traduz conforme o usuário logado. É preenchido automaticamente pelo **final do cartão** (`account_cards`).

**Views**: `v_future_installments` (parcelas futuras por mês), `v_month_by_category`, `v_recurring_candidates`.

### Segurança / LGPD

- Função `is_member(household_id)` (`security definer`, `stable`) e políticas `using (is_member(household_id)) with check (is_member(household_id))` em **todas** as tabelas. `merchants` globais (household null) são somente leitura.
- Bucket `statements` **privado**; política de Storage pelo primeiro segmento do caminho (`household_id`).
- Nunca armazenar número completo de cartão (só `last4`), CPF, endereço ou senha do PDF (a senha é usada em memória na Edge Function e descartada).
- Chave `service_role` só na Edge Function. O app usa apenas a chave pública + JWT do usuário.
- Excluir household/conta remove os PDFs do bucket (direito de eliminação).

## 7. Telas da Fase 1

| Tela | Conteúdo | Toques para a ação principal |
|---|---|---|
| Entrar | e-mail → código de 6 dígitos | — |
| Criar casal / Convite | nome do casal; "Convidar" gera link (WhatsApp/e-mail) | 2 |
| Importar | botão "Enviar fatura PDF"; lista de faturas com status ✔/⚠ | 2 |
| Conferir fatura | total declarado × calculado, diferença, obrigações futuras, lista agrupada por tipo; confirmar | 1 |
| Revisar | lançamentos de baixa confiança; categoria em chips; "sempre para X" | 2–3 |
| Início (dashboard) | seletor de mês; rosca por categoria; barras empilhadas 12 meses; variação vs. mês anterior (subiu/caiu/novo); top 10 estabelecimentos; meu × dela × nosso | — |
| Parcelas | piso das próximas faturas mês a mês + total comprometido (= obrigações futuras) | — |
| Recorrências | assinaturas detectadas, custo mensal e anual, alertas (duplicada / nova / mudou de valor) | — |

### Detecção de recorrências (determinística)

Mesmo estabelecimento normalizado em ≥ 2 faturas consecutivas, com valor dentro de ±10% e dia do mês ±5 → recorrente. Alertas: **nova** (apareceu agora), **duplicada** (dois recorrentes com mesmo nome/valor no mesmo mês, ex.: duas contas de streaming), **mudou de valor**. Custo anual = valor mais recente × 12 (ou × periodicidade detectada).

## 8. Plano de execução da Fase 1 (commits)

| # | Entrega | Critério de aceite | Como testar |
|---|---|---|---|
| 1 | Monorepo (pnpm), `packages/core` com `money` e `dates` | `parseBRL("1.234,56") === 123456`; formatação `R$ 1.234,56`; inferência de ano | `pnpm test` |
| 2 | Leitor Santander + fixture anonimizada | **soma = total** e **parcelas futuras = obrigações futuras** na fixture; tipos e donos corretos | `pnpm test` |
| 3 | Categorização + dicionário inicial + dedupe | prefixos decodificados; regra vence dicionário; sem match → Revisar; hash estável com ordinal | `pnpm test` |
| 4 | Supabase: migrations, RLS, seeds, bucket | usuário de outro household não lê nem grava nada (testes de RLS) | testes SQL |
| 5 | App: login por código, criar casal, convite por link | os dois usuários entram e veem o mesmo household | Expo Go, 2 celulares |
| 6 | Importar PDF → Edge Function → tela de conferência | fatura real importa; diferença ≠ 0 bloqueia confirmação automática | Expo Go |
| 7 | Revisar + correção em 3 toques criando regra | correção reaplica aos pendentes e aparece para o parceiro | Expo Go |
| 8 | Dashboard (5 visões) | números batem com a fatura conferida | Expo Go |
| 9 | Parcelas + recorrências | total comprometido = obrigações futuras da última fatura | Expo Go + teste |
| 10 | CSV/OFX + importação JSON assistida | mesma conferência aplicada | `pnpm test` + Expo Go |

Cada commit mantém `pnpm test` verde. Ao fim da fase: lista de pendências e riscos.

## 9. Fases 2 e 3 adaptadas (sem Open Finance e sem IA)

**Fase 2 — Casal e controle**
- Meu/dela/nosso + **modo gasto pessoal**: lançamento `is_private` → o parceiro vê só o total da categoria (via view com agregação; a policy esconde a linha).
- Orçamento por categoria com push em 80% e 100% (avaliado a cada importação). Exige **development build**.
- ~~Push a cada transação via webhook~~ → **push quando o parceiro importa uma fatura** ou quando há itens novos em Revisar.
- **Check-in mensal sem IA**: resumo gerado por regras (totais, variações, top altas, recorrências novas, encargos) + 3–5 recomendações por heurística com economia estimada (ex.: "assinatura duplicada: R$ 39,90/mês", "IOF de compras em US$: R$ X/mês"). Botão opcional "copiar resumo para meu Claude".
- **Encargos evitáveis**: anuidade (e meta de gasto para isenção, informada pelo usuário), IOF, juros, multa, seguros.

**Fase 3 — Diferenciais**
- Custo do hábito (frequência por estabelecimento/ramo → custo anual).
- Dedutível no IR + anexo de nota + export anual (CSV/PDF) de saúde e educação.
- Fluxo de caixa projetado (renda informada − fixos − parcelas − média variável), fim do mês e 6 meses.
- Metas com progresso e "quanto falta por mês".
- ~~Chat em linguagem natural~~ → **busca e filtros salvos** ("restaurante desde julho") + export; opcional "copiar dados filtrados para meu Claude".
- Monitor de cartão: melhor dia de compra (a partir do fechamento), câmbio/IOF de assinaturas em dólar. ~~Consentimento Open Finance~~ não se aplica.
- Modo privacidade (valores borrados) e tema claro/escuro.

## 10. Testes

- **Fixtures**: `fixtures/santander/<mes>/lines.json` (linhas extraídas, anonimizadas) + `expected.json` (totais declarados, nº de lançamentos por tipo, obrigações futuras).
- **Invariantes obrigatórios**: soma = total; parcelas futuras = obrigações futuras; nenhum valor em float; dedupe idempotente (importar 2× = mesmo resultado).
- **Anonimização**: nome, endereço e finais de cartão trocados; valores mantidos ou alterados preservando as somas. Só a versão anonimizada entra no git.
- **RLS**: dois households de teste; cada um tenta ler/gravar dados do outro em todas as tabelas e no Storage.

## 11. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Layout do PDF Santander muda | leitor quebra | fixtures por mês, conferência de total sempre ativa (quebra vira "diferença", nunca dado errado silencioso), importação JSON assistida como fallback |
| PDF protegido por senha | upload falha | pedir senha no upload, usar só em memória |
| Limite de CPU da Edge Function (pdf.js) | timeout em faturas longas | extração isolada em `pdf-lines`; plano B: extrair texto no app via WebView com pdf.js (funciona no Expo Go) e enviar só as linhas |
| Texto do PDF com colunas fora de ordem | lançamentos misturados | reconstrução por coordenadas (x/y), não por texto corrido |
| Ano das datas `dd/mm` | lançamento no ano errado | inferência pela data de fechamento + teste de virada de ano |
| Categorização fraca no início | fila Revisar grande nos primeiros meses | dicionário inicial amplo; cada correção vira regra |
| Push exige dev build | não testa push no Expo Go | push só na Fase 2, com EAS |

## 12. Pendências para iniciar

1. **PDF real de uma fatura Santander Unique** (ideal: 2–3 meses, com parcelas, estorno, compra em US$ e cartão adicional). Informar se tem senha.
2. Criar um projeto Supabase gratuito (guia passo a passo no commit 4/5).
3. Instalar o **Expo Go** nos dois celulares (Android/iOS).

## 13. Decisões tomadas durante a implementação (Fase 1)

- **Leitor por coordenadas:** o texto corrido do PDF mistura as duas colunas da página; o leitor separa por x (fronteira 298 pt) e lê esquerda → direita. Cobre as 7 faturas reais.
- **Conferência de parcelas futuras:** `Σ (total − n) × valor` fecha exato quando as parcelas são iguais; o banco arredonda centavos nas parcelas finais, então o app aceita desvio de até 5 centavos por parcela restante e o rotula "≈ arredondamento".
- **IOF de compras em dólar** é um lançamento próprio (`encargo`) ligado à compra; faz parte do total de despesas do Brasil.
- **Créditos de centavos** (ex.: −R$ 0,02 em parcelas) entram como `estorno` na seção de pagamentos e créditos.
- **Competência** = mês do vencimento da fatura.
- **Dono** = `owner_user_id` (null = nosso). Dono do cartão é sugestão automática; regras por estabelecimento podem fixar o dono.
- **Sem service role:** a Edge Function usa o JWT do usuário; a RLS vale também na importação.
- **Core duplicado em `supabase/functions/_shared/core`** (o deploy só empacota essa pasta); teste de sincronia impede divergência.

## 14. Fase 2 — decisões

- **Orçamento** é por competência (mês do vencimento da fatura) e vale para os meses seguintes até ser alterado.
- **Alertas 80% / 100%**: avaliados quando uma fatura é confirmada (não há gasto em tempo real sem Open Finance). Cada nível é enviado uma única vez por categoria e mês (`budget_alerts`).
- **Push**: tokens do Expo em `push_tokens`; envio por Edge Function `notify` (JWT do usuário). Android remoto exige *development build* (Expo Go não recebe push desde o SDK 53); iOS exige conta Apple Developer. Sem isso o app funciona normalmente, com avisos dentro do app.
- **Gasto pessoal**: `is_private` + dono; a RLS já esconde as linhas do parceiro. O parceiro enxerga apenas totais por categoria/mês via `partner_private_totals()` e a conferência da fatura é ajustada com `statement_hidden_sums()`.
- **Check-in e recomendações**: regras determinísticas com estimativa de economia (sem IA).
