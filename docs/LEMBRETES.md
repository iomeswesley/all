# Lembretes de gasto futuro

Aviso no celular **N dias antes** (1, 3 ou 7) e **no dia** de cada ocorrência de um gasto futuro
(tabela `planned_expenses`), sempre às 9h no horário do aparelho.

## Como funciona

- **Notificações locais agendadas** (`expo-notifications`, gatilho `DATE`). Não precisa de servidor,
  Edge Function nem token de push. Cada aparelho agenda os seus.
- **Lógica pura** em `packages/core/src/reminders.ts` → `plannedReminders(planejados, { now, leadDays })`
  devolve `{ id, fireAt, title, body, … }` em ordem de disparo. Testes em `packages/core/test/reminders.test.ts`.
  - Avisos com horário já passado ficam de fora (ex.: o "3 dias antes" de algo que é amanhã — só sai o do dia).
  - Horizonte de 120 dias e teto de **48** agendamentos (o iOS guarda no máximo 64 notificações locais por app;
    a folga fica para outros avisos). Os 48 mais próximos são agendados; o resto entra nas próximas aberturas.
  - Ids estáveis `planned:<id>:<data>:before|day`: reagendar não duplica.
  - Com o **modo privacidade** ligado, o valor em R$ não aparece no texto (tela bloqueada).
- **App** em `apps/mobile/src/lib/reminders.ts`:
  - `usePlannedReminders` (montado em `src/app/(app)/_layout.tsx`) reagenda ao abrir o app logado, ao voltar
    para o primeiro plano e ao mudar a preferência.
  - `syncPlannedReminders()` é chamado ao salvar ou excluir um gasto futuro (`planejado.tsx`).
  - A sincronização busca os planejados, **cancela só os agendamentos com prefixo `planned:`** (não mexe em
    outros avisos) e agenda a lista nova. As chamadas entram em fila para não se atropelarem. Sem rede, os
    agendamentos anteriores são mantidos.
  - Android: canal próprio "Lembretes de gastos futuros" (`lembretes`).
- **Preferência** local (AsyncStorage, `lib/prefs.tsx`): `reminders` (padrão desligado) e `reminderLeadDays`
  (padrão 3). Controle no fim da aba **Planejar** (aparece quando há gasto futuro): chave "Lembrar antes" e,
  ligada, 1 / 3 / 7 dias. Ligar pede a permissão de notificação.

## Expo Go e limites

- No SDK 57 o Expo Go **não recebe push remoto no Android** (removido no SDK 53; ver `docs/FASE2.md`), mas as
  **notificações locais continuam funcionando** no Expo Go (iOS e Android). O pacote só mostra o aviso
  "not fully supported in Expo Go" no console. Conferido no código do `expo-notifications@57.0.22`: o erro de
  Expo Go só é disparado nas funções de token/push (`getDevicePushTokenAsync`, `getExpoPushTokenAsync`,
  tópicos), não em `scheduleNotificationAsync`. Para uso real, prefira um development build.
- Tocar no lembrete abre a aba Planejar só onde o listener de toques está ativo (development build com push
  configurado — `lib/push.ts`). No Expo Go o toque apenas abre o app.
- Web: não há agendamento; o controle fica escondido.
- Notificações locais são **por aparelho**: o par precisa ligar no celular dele. Gasto futuro criado pelo par
  entra nos lembretes na próxima abertura do app (não há push para reagendar à distância).
- Se o celular ficar mais de ~4 meses sem abrir o app, os lembretes acabam (horizonte de 120 dias / teto de 48).
