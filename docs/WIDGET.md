# Widget de tela inicial — "Previsto do mês"

O widget mostra, na tela inicial do celular:

- **Previsto do mês** (mesma conta do Início/Planejar: média dos últimos meses + gastos planejados a partir de hoje);
- o **próximo gasto futuro** ("Próximo: IPVA · 20/10 · R$ 1.200,00");
- o atalho **+ Lançar**, que abre `financascasal://lancar` (tela Lançar gasto).

No **modo privacidade** (olho no Início) nenhum valor vai para o widget: aparece `R$ ••••`.
Ao **sair da conta** ou excluí-la, o widget passa a mostrar só "Entre no app para ver a previsão".

> **Status (honesto):** a parte pura (payload + testes), a ponte com no-op, os layouts e a
> configuração (config plugins) estão prontos e o JS empacota para iOS e Android
> (`npx expo export`). O `npx expo prebuild` gera o target WidgetKit e o receiver Android
> corretamente. **Não foi compilado nem testado num aparelho**: este ambiente não tem
> Xcode, Android SDK nem acesso ao EAS. O primeiro development build precisa ser conferido
> com o roteiro abaixo.

## Decisão

| Plataforma | Biblioteca | Por quê |
| --- | --- | --- |
| iOS (WidgetKit) | [`expo-widgets`](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/) `~57.0.26` (oficial do Expo, usa `@expo/ui/swift-ui`) | Pacote oficial do SDK 57, com config plugin que cria o target `ExpoWidgetsTarget`, o App Group e a config de extensão do EAS. Layout em TSX com a diretiva `'widget'`. A doc do SDK 57 marca `platforms: ['ios']` e "não disponível no Expo Go". |
| Android (App Widget) | [`react-native-android-widget`](https://saleksovski.github.io/react-native-android-widget/) `^0.22.1` | O `expo-widgets` 57 **não tem Android utilizável**: o plugin Android é opt-in (`enableAndroid`) e o código nativo só desenha o nome do widget (placeholder em Glance). `react-native-android-widget` é a biblioteca consolidada para Android, com config plugin para Expo (`peerDependencies: expo >=54`), layout em JSX e handler headless. |

Fontes consultadas (a `docs.expo.dev` estava bloqueada pelo proxy deste ambiente; li o
fonte da documentação no repositório `expo/expo`, que é o que gera o site):

- `docs/pages/versions/v57.0.0/sdk/widgets.mdx` (expo/expo) — instalação, config plugin,
  diretiva `'widget'`, `createWidget`/`updateSnapshot`, limitações, Expo Go.
- `docs/pages/router/installation.mdx` (expo/expo) — "Custom entry point" (entry `index.ts`
  com `import 'expo-router/entry'`).
- Pacotes no npm: `expo-widgets@57.0.26` (dist-tag `sdk-57`; `CHANGELOG.md`, `plugin/build`,
  `android/` placeholder, `bundle/index.ts` = runtime do widget) e `@expo/ui@57.0.25`
  (modificadores `widgetURL`, `containerBackground`; componente `Link`).
- `react-native-android-widget@0.22.1` (npm): `src/AndroidWidget.ts` (usa
  `TurboModuleRegistry.getEnforcing` → quebra no Expo Go se importado), `app.plugin.js`,
  `registerWidgetTaskHandler`, `requestWidgetUpdate`, `clickAction="OPEN_URI"`.
- `expo/bundledNativeModules.json` do SDK 57 lista `expo-widgets ~57.0.23` e `@expo/ui ~57.0.22`
  (instalado com `npx expo install`; o lock ficou com uma única cópia de `@expo/ui@57.0.25`
  depois de `pnpm dedupe`).

## Como está organizado

```
packages/core/src/widget.ts          ← lógica pura: buildWidgetPayload / widgetPayloadFromData /
                                       signedOutWidgetPayload / parseWidgetPayload (testes em
                                       packages/core/test/widget.test.ts)
apps/mobile/index.ts                 ← entry: registra o handler headless Android e importa expo-router/entry
apps/mobile/src/widget/
  native.ts                          ← detecta o nativo: requireOptionalNativeModule("ExpoWidgets") (iOS)
                                       / TurboModuleRegistry.get("AndroidWidget") (Android). Expo Go → null
  bridge.ts                          ← publishWidget(payload) / clearWidget(); no-op sem nativo; nunca lança
  index.ts                           ← syncWidget, useWidgetSync (Início/Planejar), refreshWidget (após salvar)
  storage.ts                         ← último payload no AsyncStorage (o widget Android lê daqui)
  register.ts                        ← registerWidgetTask() (Android)
  ios/PrevistoWidget.ios.tsx         ← layout SwiftUI (expo-widgets) — small e medium
  ios/PrevistoWidget.tsx             ← fallback (null) para as outras plataformas
  android/PrevistoAndroid.tsx        ← layout do App Widget (claro/escuro)
  android/task-handler.tsx           ← handler headless: lê o payload salvo e desenha
```

**Expo Go continua funcionando**: nenhum módulo do app importa `expo-widgets`,
`@expo/ui/swift-ui` ou `react-native-android-widget` no topo. Eles só são carregados por
`require()` preguiçoso depois de `widgetPlatform()` confirmar que o módulo nativo está no
binário. Sem ele, `publishWidget`/`refreshWidget`/`clearWidget` retornam na hora (nem fazem
consultas ao Supabase).

Quando o widget é atualizado:

- ao carregar/recarregar o **Início** e o **Planejar** (e ao alternar o modo privacidade) — `useWidgetSync`;
- depois de **salvar um lançamento** (Lançar gasto) ou um **gasto futuro** — `refreshWidget()` busca
  faturas/lançamentos/planejados e republica (fire-and-forget);
- ao **sair da conta** / excluir a conta — `clearWidget()`.

O conteúdo só é redesenhado se mudou (o "Atualizado hh:mm" sozinho não força redesenho).
Não há atualização periódica em background: o widget mostra o último estado que o app publicou
(Android: `updatePeriodMillis: 0`; iOS: snapshot único).

Toques:

- iOS pequeno (`systemSmall`): o widget inteiro abre `financascasal://lancar` (o WidgetKit só aceita um link no tamanho pequeno).
- iOS médio: corpo abre `financascasal://planejar`; o botão "+ Lançar" (`Link`) abre `financascasal://lancar`.
- Android: corpo abre `financascasal://planejar`; o botão "+ Lançar" abre `financascasal://lancar` (`OPEN_URI`).

## Configuração (app.json)

Já está no `apps/mobile/app.json`:

- `expo-widgets`: `bundleIdentifier: br.com.financascasal.app.ExpoWidgetsTarget`,
  `groupIdentifier: group.br.com.financascasal.app`, widget `PrevistoWidget` (small/medium).
- `react-native-android-widget`: widget `PrevistoWidget` 3×2 células (mín. 180×110dp), redimensionável.

O nome `PrevistoWidget` precisa ser igual em `app.json` e no código (`createWidget("PrevistoWidget", …)`
e `ANDROID_WIDGET_NAME`). Nada em `ios/` ou `android/` é editado à mão (CNG).

## Passo a passo do development build

Pré-requisitos: conta Expo (`npx eas-cli login`) e `npx eas-cli init` em `apps/mobile`
(se ainda não houver `projectId` no app.json — ver docs/FASE2.md).

### Android

1. `cd apps/mobile && npx eas-cli build --profile development --platform android`
   (ou local, com Android Studio: `npx expo run:android`).
2. Instale o APK, abra o app, faça login e abra o **Início** (isso publica o primeiro payload).
3. Na tela inicial do Android: segure numa área vazia → Widgets → "Finanças do Casal" → **Previsto do mês**.
4. Confira:
   - valor previsto igual ao do Planejar (mês do topo) e a linha "Próximo: …";
   - tocar em **+ Lançar** abre a tela Lançar gasto; tocar no corpo abre o Planejar;
   - lançar um gasto / salvar um gasto futuro e voltar à tela inicial → widget atualizado;
   - ligar o modo privacidade no Início → widget com `R$ ••••`;
   - sair da conta → "Entre no app para ver a previsão";
   - tema escuro do sistema → layout escuro.

### iOS

1. Precisa de conta Apple Developer (App Groups exigem provisioning). O EAS cria as credenciais
   do app **e** do target `ExpoWidgetsTarget` (o plugin grava `extra.eas.build.experimental.ios.appExtensions`
   na config). `cd apps/mobile && npx eas-cli build --profile development --platform ios`
   (ou local, com Xcode: `npx expo run:ios --device`).
2. Abra o app, faça login e abra o **Início**.
3. Segure na tela inicial → "+" → "Finanças do Casal" → **Previsto do mês** (pequeno ou médio).
4. Mesmo roteiro de conferência do Android. No pequeno, tocar em qualquer lugar abre o Lançar.

### Se algo não aparecer

- Widget sem dados: abra o Início uma vez (o widget só mostra o que o app publicou).
- Em dev, os avisos aparecem no Metro como `[widget] …` (falhas da ponte nunca derrubam a tela).
- iOS: o layout roda num runtime isolado — nada declarado fora da função `'widget'` existe lá
  (por isso as cores ficam dentro da função). Ver "Known limitations" na doc do `expo-widgets`.
- Mudou `app.json` (nomes, tamanhos)? Precisa de um novo build (é configuração nativa).

## Testes

- `pnpm --filter @financas/core test` (inclui `test/widget.test.ts`): textos, máscara no modo
  privacidade (nenhum dígito de valor vaza), estado vazio, deslogado, deep links, cálculo igual à previsão.
- `npx expo export --platform ios --platform android` empacota; no bundle iOS a função `'widget'`
  vira string (transformação do `babel-preset-expo`), como esperado pelo runtime do widget.
