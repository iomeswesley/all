// Entry customizado (docs do Expo Router → Installation → "Custom entry point").
// Registra o handler headless do widget Android (react-native-android-widget); no Expo Go,
// iOS e web é no-op. O expo-router/entry fica por último, como pede a documentação.
import { registerWidgetTask } from "./src/widget/register";
import "expo-router/entry";

registerWidgetTask();
