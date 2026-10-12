# Fase 3 — diferenciais

Tudo roda **no aparelho**, sobre os dados do casal. Nenhum serviço de IA recebe nada.

| Recurso | Onde | Como funciona |
|---|---|---|
| **Custo do hábito** | Mais → Custo do hábito | Estabelecimentos com ≥ 6 visitas/mês (e presentes em metade dos meses). Mostra visitas/semana, ticket médio, custo por mês e **por ano** (média dos últimos 6 meses × 12) e quanto economiza cortando 1 visita em cada 4. Assinaturas (1–2 cobranças/mês) ficam de fora. |
| **Imposto de renda** | Mais → Imposto de renda | Marque despesas como dedutíveis (saúde, educação, outros), **anexe a nota** (foto ou galeria; bucket privado) e **exporte o CSV do ano** (`;` e vírgula decimal, abre no Excel/Sheets). Educação respeita o limite anual por pessoa (padrão R$ 3.561,50; editável em `household_settings`). Farmácia, medicamentos, academia e livros **não são sugeridos**. Por pessoa (cada um declara o seu). |
| **Fluxo de caixa** | Mais → Fluxo de caixa | Próximos 6 meses: renda − fixos (recorrências + “outros fixos” que você informa) − parcelas já contratadas − média do gasto variável (3 meses, sem parcelas/encargos/recorrências). Mês mais apertado e acumulado. |
| **Metas** | Mais → Metas | Progresso e **quanto guardar por mês** até o prazo; indica se cabe na sobra projetada do fluxo de caixa (“cabe”, “apertado”, “não cabe”). “+ Guardei” soma valores. |
| **Pergunte aos dados** | Mais → Pergunte aos dados | Perguntas em português (“quanto gastamos com restaurante desde julho?”), respondidas por regras: período (desde/em/de…a/últimos N meses/este ano…), categoria, estabelecimento, de quem (meu/dela). Salve perguntas favoritas. Não entendeu? Diz que não entendeu — não inventa. |
| **Monitor do cartão** | Mais → Monitor do cartão | Melhor dia de compra e quantos dias até pagar (usa o “melhor dia” impresso na fatura); limite; isenção da anuidade; **serviços em dólar** com preço, câmbio, variação, IOF efetivo (~3,5%) e custo anual já com IOF. |
| **Modo privacidade** | Olho no painel / Mais → Aparência | Troca todo valor em R$ por “••••” (inclui eixos dos gráficos). |
| **Tema claro/escuro** | Mais → Aparência | Automático, claro ou escuro (cores de gráfico validadas para os dois). |

## Limites e cuidados
- **IR:** o app organiza e exporta; **não substitui contador** nem confere regras da Receita. Os limites mudam: confirme o vigente. Despesa de um dependente/titular precisa seguir as regras do programa da Receita.
- **Perguntas:** o motor entende frases comuns, não qualquer frase. Parcelas contam no mês cobrado; demais compras, na data. Gasto pessoal do seu par não entra na busca (só nos totais do painel).
- **Fluxo de caixa:** projeção do cartão + fixos que você informa. Não vê conta corrente, salário real nem compras grandes futuras.
- **Monitor de cartão:** “consentimento do Open Finance” não se aplica (o app não usa Open Finance). Câmbio “de hoje” não existe sem fonte externa; mostramos o câmbio das suas cobranças.
- **Gasto variável** inclui tudo que não é parcela, encargo ou recorrência detectada: se uma recorrência não foi detectada, ela entra no variável.

## Publicar o que mudou
```bash
npx supabase db push                                   # migration 20261013: IR, comprovantes, configurações, perguntas salvas
node scripts/sync-core-to-functions.mjs
npx supabase functions deploy parse-statement
npx supabase functions deploy notify
```
No app, a primeira câmera/galeria pede permissão (texto em `app.json`).

## Testes
- Núcleo (152): hábito conferido por contagem direta; IR (sugestões, limite, CSV); metas; fluxo de caixa (identidades e parcelas = piso da próxima fatura); perguntas conferidas contra somas diretas nas 7 faturas; monitor (IOF somado exatamente uma vez).
- Banco (52, Postgres real): comprovante só na pasta do casal; bucket privado; configurações/metas/perguntas isoladas por casal; a view do painel enxerga as colunas de IR.
