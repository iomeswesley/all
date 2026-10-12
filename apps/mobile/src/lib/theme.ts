import { useColorScheme } from "react-native";
import { CAT } from "@financas/core";
import { usePrefs } from "./prefs";

/** Tokens de cor. Paleta categórica validada (8 matizes, claro/escuro) + superfícies neutras. */
export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  /** fundo de botões/chips selecionados (texto branco por cima, contraste ≥ 4,5:1) */
  primaryFill: string;
  dangerFill: string;
  danger: string;
  warning: string;
  success: string;
  series: string[];
  /** cinza para "Demais" (categorias fora dos 8 matizes) */
  other: string;
}

const light: Theme = {
  dark: false,
  bg: "#f5f5f2",
  surface: "#fcfcfb",
  border: "#e4e3de",
  text: "#0b0b0b",
  textSecondary: "#52514e",
  textMuted: "#6b6a64",
  primary: "#1c68c4",
  onPrimary: "#ffffff",
  primaryFill: "#1c68c4",
  dangerFill: "#c4302f",
  danger: "#c4302f",
  warning: "#8f5a00",
  success: "#12794f",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  other: "#9a9992",
};

const dark: Theme = {
  dark: true,
  bg: "#121211",
  surface: "#1a1a19",
  border: "#2d2d2b",
  text: "#f0efec",
  textSecondary: "#c3c2b7",
  textMuted: "#8f8e86",
  primary: "#3987e5",
  onPrimary: "#ffffff",
  primaryFill: "#2468c7",
  dangerFill: "#c4302f",
  danger: "#e66767",
  warning: "#e0a03a",
  success: "#3fbf8c",
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  other: "#6f6e68",
};

/** Tema: escolha da pessoa (claro/escuro) ou o do sistema. Assinar as preferências também redesenha os valores ao alternar a privacidade. */
export function useTheme(): Theme {
  const system = useColorScheme();
  const { theme } = usePrefs();
  return (theme === "system" ? system : theme) === "dark" ? dark : light;
}

/**
 * Cada categoria tem SEMPRE o mesmo matiz (cor segue a entidade, não o ranking).
 * As 8 principais ganham matiz; as demais viram "Demais" nos gráficos.
 */
const SLOT_BY_CATEGORY: Record<number, number> = {
  [CAT.RESTAURANTE]: 0,
  [CAT.MERCADO]: 1,
  [CAT.TRANSPORTE]: 2,
  [CAT.COMPRAS]: 3,
  [CAT.SAUDE]: 4,
  [CAT.LAZER]: 5,
  [CAT.ASSINATURAS]: 6,
  [CAT.CASA]: 7,
};

export function categoryColor(theme: Theme, categoryId: number | null | undefined): string {
  const slot = categoryId == null ? undefined : SLOT_BY_CATEGORY[categoryId];
  return slot === undefined ? theme.other : theme.series[slot]!;
}

export const isFoldedCategory = (categoryId: number | null | undefined) =>
  categoryId == null || SLOT_BY_CATEGORY[categoryId] === undefined;

/** Ordem fixa de empilhamento (a mesma dos matizes validados como pares adjacentes). */
export const STACK_ORDER: number[] = [CAT.RESTAURANTE, CAT.MERCADO, CAT.TRANSPORTE, CAT.COMPRAS, CAT.SAUDE, CAT.LAZER, CAT.ASSINATURAS, CAT.CASA];

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;
