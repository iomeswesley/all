# Comentários e reações em lançamentos

Inspirado no Honeydue: em vez de mandar "o que foi esse iFood de R$ 87?" no WhatsApp, a conversa fica no próprio lançamento.

## No app
| Onde | O quê |
|---|---|
| **Fatura** e **Pix e dinheiro** | Cada lançamento tem um ícone 💬 à direita. Com comentários vira **💬 2** (e mostra as reações, ex.: ❤️). Tocar abre a folha **Conversa**. |
| **Revisar** | Estabelecimento com um lançamento só ganha o chip **💬 Perguntar** (ex.: "isso é seu?"). |
| **Conversa** | Barra de reações (👍 ❤️ 😬 🤔 ✅ — uma por pessoa; tocar na mesma tira, em outra troca), lista de comentários (até 500 caracteres) e campo para escrever. **Toque longo** no seu comentário → Editar / Apagar ("editado" aparece). |
| **Início** | Cartão **💬 Conversas** com comentários novos do par desde a última vez que você abriu cada conversa (selo "novo"/"3 novos"). "Marcar como lido" zera. O "já vi" fica **só neste aparelho** (AsyncStorage); na primeira vez considera os últimos 7 dias. |

## Aviso ao par (push)
Ao comentar, o app chama a função `notify` com `{ commentId }` (melhor esforço: o comentário nunca é desfeito). O par recebe **"Ana comentou em iFood R$ 87,00"** com o texto; tocar abre o Início. Regras: só quem escreveu dispara o aviso do próprio comentário, **uma vez** por comentário (`notified_at`, que não volta a ficar vazio), e nada sai em gasto pessoal 🔒. Reações não geram push. Sem push (Expo Go, iPhone sem conta Apple) o cartão do Início cobre o aviso.

## Privacidade (gasto pessoal 🔒)
Comentários e reações seguem **a mesma visibilidade do lançamento**: as políticas usam `public.tx_visible()`, que consulta `transactions` com a RLS de quem pergunta. Logo o par não vê nem cria comentários/reações num gasto pessoal seu — a conversa ali vira anotação só sua. Se um lançamento comentado virar pessoal depois, os comentários somem para o par (continuam para o dono). Apagar o lançamento apaga a conversa; apagar um usuário deixa o autor como "Ex-membro".

## Banco
Migration `supabase/migrations/20261018000002_comments.sql`: `tx_comments` (texto 1..500, `edited_at`, `notified_at`) e `tx_reactions` (lista fechada, `unique (transaction_id, user_id)`), RLS por casal (`is_member`) + visibilidade do lançamento; só o autor edita/apaga; casal, lançamento e autor não mudam (gatilhos); `anon` sem acesso. **Exportação de dados:** `export_household_data()` ainda não inclui as duas tabelas (fica com o coordenador).

## Código
- Núcleo: `packages/core/src/comments.ts` (reações, validação, contadores, não lidos, mensagem do push) — testes em `packages/core/test/comments.test.ts`.
- Função: `supabase/functions/notify/comment.ts` e `comment-store.ts`; `index.ts` aceita `{ commentId }`.
- App: `apps/mobile/src/lib/comments.ts`, `components/TxThread.tsx` (folha + hook `useTxThreads`), `components/CommentsInbox.tsx`, prop `thread` no `TxItem`.
- Testes de banco: `packages/db-tests/test/comments.test.ts` (isolamento entre casais, gasto pessoal, autor, anônimo, reações, aviso ao par, exclusões).

## Publicar
```bash
npx supabase db push
node scripts/sync-core-to-functions.mjs
npx supabase functions deploy notify
```
