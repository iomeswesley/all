# Fase 1 — o que foi feito, o que ficou pendente e riscos

## Entregue (todos com testes automatizados, exceto telas — ver "Não verificado")
- **Núcleo** (`packages/core`, 108 testes): dinheiro em centavos; datas dd/mm/aaaa com inferência do ano; leitor da fatura Santander por coordenadas (2 colunas, 2 cartões, parcelas, US$ com cotação e IOF vinculados, créditos de centavos, anuidade); conferência; deduplicação SHA-256; categorização em camadas; correção → regra; análises do dashboard; recorrências; linha do tempo de parcelas.
- **Conferência real:** nas **7 faturas reais** (abr–out/2026) a soma dos lançamentos fecha **exatamente** com o total, pagamentos, créditos e despesas em US$. Parcelas futuras = obrigações futuras: **exato em set/26**; nos demais meses difere só por **centavos de arredondamento do banco** (as primeiras parcelas saem alguns centavos maiores que as últimas) e o app mostra isso como "≈ arredondamento", sem esconder.
- **Supabase** (31 testes em Postgres real): schema, RLS por casal, convite (casal de até 2), bucket privado, funções (`create_household`, `create_invite`, `accept_invite`, `save_rule_and_apply`, `confirm_statement`), dicionário global, e a **Edge Function** `parse-statement` (testada contra o banco: duplicata, substituição de rascunho, fatura confirmada protegida).
- **App** (empacota para Android e iOS; `tsc` limpo): login por código, casal/convite, importar PDF, conferência, revisar (2 toques), dashboard (rosca, 12 meses, variação, top 10, meu/dela/nosso), parcelas, recorrências, cartões/donos.

## Não verificado (preciso do seu teste)
Este ambiente não tem celular, projeto Supabase nem Deno. Portanto **não foram executados de ponta a ponta**:
1. As telas no Expo Go (só empacotamento + tipos). Layout, gestos e gráficos podem precisar de ajuste fino.
2. A Edge Function rodando no Deno do Supabase (a lógica é testada em Node; a "cola" `index.ts` com `unpdf`/`supabase-js` não).
3. O e-mail com código de 6 dígitos (depende do template configurado em SETUP §3).
4. Deep link do convite no Expo Go (o link vira `exp://…`); o **código colado** é o caminho garantido.

## Pendências conhecidas
- **Foto/OCR da fatura, CSV e OFX**: fora desta entrega (OCR exige módulo nativo; CSV/OFX dependem de qual formato o Santander exporta para você — me mande um exemplo).
- **Importação assistida por JSON** (para usar seu Claude quando o leitor falhar) — especificada, não implementada.
- Cartões: no PDF **todo o gasto aparece sob um único cartão**; o outro só tem a anuidade. Para separar "meu/dela" é preciso usar "De quem é?" por estabelecimento (vira regra) — definir os donos em Mais → Cartões.
- Dashboard usa **mês do vencimento** como competência (fatura "0926" = vence em setembro). Se preferir pelo mês das compras, é uma função só (`statementMonthKey`).
- "Tudo ou nada" no cartão adicional: não há ainda divisão automática de despesas do mesmo cartão.
- Gráficos: apenas 8 categorias têm cor própria (paleta validada); Educação, Viagem, Serviços e Outros aparecem como "Demais" nos gráficos (a lista mostra os nomes).
- Sem testes de interface automatizados (Maestro/Detox) nem lint configurado.

## Riscos
| Risco | Mitigação atual |
|---|---|
| Santander muda o layout do PDF | Conferência soma=total bloqueia erro silencioso; fixtures por mês; ajuste fica concentrado em `parsers/santander` |
| Limite de e-mails do Supabase gratuito | Configurar SMTP próprio (SETUP §3) |
| `unpdf` no Deno lento/com limite de CPU em PDFs grandes | PDFs de 300 KB testados no Node; plano B: extrair texto no app (WebView + pdf.js) |
| Categorização fraca no início | ~27% dos lançamentos reais caem em "Revisar" no 1º dia; cada correção vira regra e some nos meses seguintes |
| PDF com senha | O app pede a senha na hora; ela não é guardada |
| Dados pessoais em fixtures | Anonimizadas por script; verificado sem nome/endereço/cartão/código de barras |
