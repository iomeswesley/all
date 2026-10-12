# Fase 2 — casal e controle

## O que entrou
| Item | Onde |
|---|---|
| **Gasto pessoal** 🔒 | “De quem é?” → *Gasto pessoal* (em Revisar e na conferência). Só o dono vê os itens; o par vê apenas o **total por categoria** (soma nos gráficos e no orçamento). A conferência da fatura do par fecha porque inclui os totais ocultos. |
| **Orçamento** | Mais → Orçamento: limite por categoria; vale para o mês e os seguintes até mudar; barra de progresso com texto (“Perto do limite · 85%”, “Estourou”). |
| **Alertas 80% / 100%** | Ao **confirmar uma fatura**, a função `notify` avalia o mês, grava o alerta (um por categoria/mês/nível) e avisa os dois. No app aparece um alerta na hora e um cartão no painel — não depende de push. |
| **Aviso ao par** | “Ana confirmou a fatura de set/26 — 94 lançamentos, 20 para revisar.” Tocar abre **Revisar**. |
| **Check-in mensal** | Mais → Check-in: totais, o que subiu/caiu, novos estabelecimentos, orçamento, encargos e **1–5 recomendações com economia estimada em R$/mês**. “Compartilhar resumo” gera texto para mandar a quem quiser (inclusive colar no seu Claude). Sem IA no app. |
| **Encargos evitáveis** | Mais → Encargos: por mês, anuidade (e se está isenta), IOF, juros, multa, mora e seguros. |

### Como as recomendações são calculadas (regras, não IA)
duplicidade de assinatura (valor da cobrança extra) · orçamento estourado (o excesso) · categoria ≥20% e ≥R$ 50 acima da média dos 3 meses anteriores (o excesso) · juros/multa/mora (100% evitável) · IOF no exterior ≥ R$ 10 (teto) · anuidade cobrada · delivery iFood ≥ R$ 150 (estimativa: cortar 1 em cada 4). Itens “estimados” são marcados como tal.

## Limite importante: o cartão só chega depois do fechamento
Sem Open Finance não existe gasto de cartão em tempo real: o alerta do cartão sai quando a **fatura é confirmada**. Para o que acontece durante o mês (Pix, dinheiro, débito, boleto) existe o **Lançar gasto** ([docs/COMPLEMENTOS.md](COMPLEMENTOS.md)), que reavalia o orçamento na hora.

## Publicar o que mudou
```bash
npx supabase db push                                  # nova migration: push_tokens, budget_alerts, gasto pessoal
node scripts/sync-core-to-functions.mjs
npx supabase functions deploy parse-statement
npx supabase functions deploy notify
```

## Notificações push (opcional — precisa de development build)
O **Expo Go não recebe push** no Android (desde o SDK 53). Para ter push de verdade:

1. Conta Expo gratuita: `npx eas-cli login`, depois em `apps/mobile`: `npx eas-cli init` (grava o `projectId` em `app.json`).
2. Android: `npx eas-cli build --profile development --platform android` e instale o APK nos dois celulares. As credenciais FCM são guiadas pelo próprio EAS (`eas credentials`).
3. iPhone: exige conta **Apple Developer (US$ 99/ano)** para instalar um build próprio. Sem ela, no iPhone continue com Expo Go e os avisos dentro do app.
4. Rode `npx expo start --dev-client`, abra o app, **Mais → Notificações → Ativar neste aparelho**.

Categorizar pela notificação: o aviso de **lançamento manual** do seu par traz botões *Mercado / Restaurante / Transporte* (veja [docs/COMPLEMENTOS.md](COMPLEMENTOS.md)); os demais avisos abrem a tela **Revisar**.

## Testes da fase
- Núcleo: orçamento (limiar em inteiros, herança entre meses, alertas únicos), encargos, check-in com as 7 faturas, mensagens de push, gasto pessoal oculto e conferência do par.
- Banco (Postgres real, 2 pessoas): gasto pessoal invisível ao par, totais corretos, par não altera/apaga, tokens e alertas sob RLS, e a função `notify` ponta a ponta (gasto pessoal do par estoura o orçamento; alerta único; aviso só ao par).
