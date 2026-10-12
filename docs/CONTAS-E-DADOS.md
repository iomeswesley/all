# Contas, outros bancos, seus dados e IR

## Contas e bancos (Mais → Contas e bancos)
- Adicione **cartões e contas correntes** de qualquer banco, renomeie e exclua (exclui faturas, lançamentos e arquivos da conta, com confirmação).
- Cada conta tem as próprias faturas. Ao importar, escolha para qual conta vai (se houver mais de uma).
- A conta **“Pix e dinheiro”** é automática e não recebe importação.

## Como entra o extrato de cada banco
| Fonte | Bancos | Conferência |
|---|---|---|
| **PDF da fatura** | Santander (leitor próprio, testado nas suas 7 faturas) | soma = total, pagamentos, créditos, US$ e parcelas futuras = obrigações futuras |
| **OFX** | qualquer banco que exporte (cartão e conta corrente; SGML e XML; Windows-1252) | **Sem total no arquivo, a soma NÃO é conferida** — o app diz isso (“Sem conferência”) em vez de fingir que bate |
| **JSON assistido** | qualquer banco, usando o *seu* Claude uma vez por fatura | se você informar o total da fatura, confere; senão, “sem conferência” |

- **Importação assistida** (Importar → “colar JSON”): o app entrega as instruções para o seu Claude, valida o JSON colado na hora (erros em português) e importa. O app nunca chama IA.
- **Extratos que se sobrepõem** (exportar 1–31/10 e depois 15/10–15/11) são tratados: os lançamentos já importados são ignorados e contados; se nada for novo, não cria fatura. Com total declarado e sobreposição, recusa (não dá para conferir só parte).
- **PDF de outro banco** não é reconhecido (não invento leitor sem um PDF real de exemplo). Para adicionar: um leitor em `packages/core/src/parsers/<banco>` registrado em `parsers/index.ts`, com fixture anonimizada — mande um PDF e eu faço.
- **CSV** continua pendente (cada banco tem um formato; preciso de um exemplo).

## Seus dados (Mais → Seus dados)
- **Exportar**: JSON com tudo o que você pode ver (contas, faturas, lançamentos, regras, orçamentos, metas). Gasto pessoal do seu par, convites e tokens ficam de fora.
- **Sair do casal**: o par continua com o histórico (e vira dono se você era). **Seus gastos pessoais são apagados**; o resto fica “nosso”. A última pessoa não “sai”: exclui o casal.
- **Remover o par** (dono): mesma regra.
- **Excluir o casal** (dono ou única pessoa): digita o nome; apaga os arquivos e **tudo** para as duas pessoas.
- **Excluir a conta**: digita EXCLUIR. Única pessoa → apaga arquivos, casal e depois o usuário; com par → sai do casal e depois apaga o usuário. Se algo falhar no meio, **o usuário não é apagado** e dá para tentar de novo.
- A função `delete-account` usa a chave de serviço **só** para apagar arquivos e o próprio usuário do JWT verificado.
- Apagar um usuário nunca é bloqueado por “quem criou/confirmou”: essas referências viram vazias.

## IR: limite de educação (Imposto de renda → Limite de educação)
Campo editável do limite anual por pessoa (padrão R$ 3.561,50). Confirme o valor vigente na Receita e ajuste quando mudar; o relatório e o CSV passam a usar o novo valor.

## Publicar
```bash
scripts/deploy-supabase.sh SEU-PROJECT-REF     # migrations + 3 funções, em um comando
```
Depois, no painel do Supabase (navegador): **Authentication → Email Templates** (código de 6 dígitos; ver [SETUP.md](SETUP.md) passo 3) e, para uso diário, um SMTP próprio.
