# Como colocar para rodar (Supabase + Expo Go)

Tempo estimado: 30–40 minutos na primeira vez. Você só precisa de **Node 22+**, **pnpm** e o app **Expo Go** nos celulares.

## 1. Criar o projeto Supabase (gratuito)

1. Acesse supabase.com → **New project**. Região: **South America (São Paulo)**. Guarde a senha do banco.
2. Em **Project Settings → API** copie:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key** (a chave *pública*; **nunca** use a `service_role` no app).

## 2. Criar as tabelas, regras de acesso e o bucket privado

No terminal, na raiz do repositório:

```bash
pnpm install
npx supabase login
npx supabase link --project-ref SEU-PROJECT-REF   # o "xxxx" da URL
npx supabase db push                               # aplica supabase/migrations/* (todas as fases)
```

Isso cria as tabelas (valores em centavos), as regras de acesso por casal (RLS), o bucket privado `statements`, as 12 categorias e o dicionário inicial de estabelecimentos.

## 3. Login por código no e-mail (importante)

O app usa login sem senha com **código de 6 dígitos**. Em **Authentication → Email Templates**, edite **Magic Link** *e* **Confirm signup** para mostrar o código:

```html
<h2>Seu código de acesso</h2>
<p>Digite no app: <strong>{{ .Token }}</strong></p>
```

> ⚠️ O e-mail embutido do Supabase tem limite baixo (poucos envios por hora). Para uso diário, configure um SMTP próprio em **Authentication → SMTP Settings** (ex.: Resend, plano gratuito).

## 4. Publicar a função que lê o PDF

```bash
node scripts/sync-core-to-functions.mjs        # copia o código compartilhado para a função
npx supabase functions deploy parse-statement
npx supabase functions deploy notify        # alertas de orçamento e avisos
npx supabase functions deploy delete-account # excluir conta e dados
```

Ou tudo de uma vez: `scripts/deploy-supabase.sh SEU-PROJECT-REF`.

A função roda **com a sessão do usuário** (sem chave de serviço): a RLS vale para tudo. Os logs não contêm dados da fatura.

## 5. Configurar o app

```bash
cp apps/mobile/.env.example apps/mobile/.env
# edite apps/mobile/.env com a URL e a anon key
cd apps/mobile && npx expo start --clear
```

Abra o **Expo Go**, escaneie o QR code (celular e computador na mesma rede; se não funcionar, `npx expo start --tunnel`).

## 6. Primeiro uso

1. **Entrar** com seu e-mail → código → **Criar o nosso casal**.
2. **Mais → Casal → Gerar e compartilhar convite** e mande pelo WhatsApp. Sua esposa abre o link (ou cola o código na tela inicial), faz login com o e-mail dela e entra no mesmo casal.
3. **Importar → Escolher PDF da fatura.** Na tela de conferência veja o banner:
   - ✓ *A soma confere* → **Confirmar fatura**.
   - ✕ *Diferença de R$ X* → revise (⋯ em cada lançamento para corrigir/excluir; “Adicionar lançamento que faltou”).
4. **Mais → Cartões e donos:** defina de quem é cada cartão (final 4 dígitos).
5. **Revisar:** classifique os estabelecimentos desconhecidos — cada toque vira regra para os dois.
6. Importe as faturas dos meses anteriores (de preferência em ordem) para o painel de 12 meses, variações e recorrências ficarem completos.

## Testes

```bash
pnpm test                    # núcleo (leitor, conferência, categorias) + banco (RLS) — sem internet
pnpm typecheck
# Opcional: roda o leitor nos SEUS PDFs (nunca commite PDFs)
FATURAS_DIR=/pasta/com/pdfs pnpm --filter @financas/core test private-pdfs
```

## Segurança e LGPD (resumo)

- RLS em todas as tabelas: só membros do casal leem/escrevem; testado com dois casais e usuário anônimo.
- Só os **4 últimos dígitos** dos cartões; nenhum número completo, CPF ou senha é armazenado. Senha de PDF protegido é usada em memória e descartada.
- PDFs ficam em bucket **privado**, em pasta com o id do casal; políticas de Storage idênticas à RLS.
- Chaves: o app usa só a chave pública (anon). Nada de IA/terceiros recebe seus dados.
- Fixtures do repositório são **anonimizadas** (`scripts/anonymize-statement.mjs`); `*.pdf` e `fixtures/private/` estão no `.gitignore`.
