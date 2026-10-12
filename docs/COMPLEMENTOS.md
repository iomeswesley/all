# Complementos

## Regras (Mais → Regras)
Cada correção vira uma regra para o casal. Agora dá para **ver, editar e apagar**:
- lista com o padrão, o tipo (*contém / começa com / expressão*), a categoria, o dono e **quantos lançamentos já importados a regra casa**;
- **Nova regra** manual, com contagem ao vivo de quantos lançamentos ela pegaria e validação (expressão quebrada não entra);
- **Editar** com a opção “aplicar aos já importados”;
- **Apagar**: *só a regra* (os lançamentos ficam como estão) ou *apagar e reclassificar* (o que foi classificado por ela volta ao dicionário/outras regras ou à fila Revisar). **Correções manuais nunca são tocadas.**

## Lançar gasto — Pix, dinheiro, débito, boleto (Mais → Lançar, ou botão no painel)
Para o que **não passa no cartão** e por isso nunca aparece na fatura.
- Campos: valor, descrição, meio (Pix/Dinheiro/Débito/Boleto/Outro), categoria, data (hoje, ontem ou dd/mm), de quem e *gasto pessoal*.
- Sem categoria escolhida, **as regras do casal sugerem** (ex.: “Pix Diarista” → Casa); se não reconhecer, vai para Revisar.
- Entra no painel, no orçamento, nas recorrências (uma diarista mensal no Pix vira recorrência) e no fluxo de caixa. **Competência = mês do pagamento** (a fatura do cartão usa o mês do vencimento).
- Ao lançar, o **orçamento do mês é reavaliado na hora** (80% e 100%, uma vez por nível) e o par recebe “Ana lançou R$ 180,00”. Gasto pessoal conta no orçamento, mas o aviso ao par **não é enviado**.
- Mais → Pix e dinheiro: lista por mês, corrigir categoria, excluir.
- Fica numa conta própria “Pix e dinheiro”, criada sozinha. Só lançamento manual pode existir sem fatura (regra no banco).

## Categorizar pela notificação
O aviso “Ana lançou…” de um lançamento **sem categoria** traz os botões **Mercado · Restaurante · Transporte**. Tocar num botão classifica sem abrir o app (e cria a regra “sempre”), avisando com uma notificação local “Categorizado → …”. Só age se o lançamento ainda estiver em Revisar (não duplica). Se o app estava fechado, a ação é aplicada na próxima abertura.
**Precisa de um build próprio do app** (ver [FASE2.md](FASE2.md)); no Expo Go não funciona. Os outros avisos abrem a tela Revisar.

## Acabamento
- **Ícone, ícone adaptativo (Android), monocromático e splash** (claro/escuro) novos, gerados por script (rosca de gastos).
- **Contraste WCAG AA medido**: o texto “mudo” do tema claro, o azul dos botões e os botões brancos no tema escuro estavam abaixo de 4,5:1. Corrigidos (tokens `primaryFill`/`dangerFill`) e **travados por teste** (`scripts/check-contrast.mjs`, roda em `pnpm test`).
- **Alvos de toque** de chips e botões pequenos subiram para 44 pt; gráfico de 12 meses ganhou descrição para leitor de tela; todos os campos e botões de ícone têm rótulo.
- **Lint** (`pnpm lint`, regras do React Compiler): 7 achados reais corrigidos (estado dentro de efeito, ref durante render, etc.). `expo-doctor`: 19/21 verificações passam; as 2 restantes só precisam de internet (`exp.host`), que este ambiente bloqueia.

## Publicar
```bash
npx supabase db push                                  # migration 20261014 (conta Pix e dinheiro, view e totais incluem manuais)
node scripts/sync-core-to-functions.mjs
npx supabase functions deploy parse-statement
npx supabase functions deploy notify                  # agora aceita { txId }
```

## Testes novos
Núcleo (161): validação e montagem do lançamento manual (regras aplicadas, gasto pessoal, hash), datas digitadas, casamento/validação de regras, botões da notificação. Banco (63, Postgres real): conta única por casal, painel e totais com manuais, restrição “só manual sem fatura”, aviso em tempo real com alerta único e sem vazar gasto pessoal.
