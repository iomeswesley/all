import { useColorScheme } from "react-native";
import { CAT } from "@financas/core";
import { usePrefs } from "./prefs";

/** Tokens de cor. Paleta categórica validada (8 matizes, claro/escuro) + superfícies neutras. */
export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  /** fundo de controles e trilhos (segmentos, barras vazias) */
  surfaceAlt: string;
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
  /** gastos planejados nos gráficos de previsão */
  planned: string;
  /** degradê do cartão de destaque (texto branco por cima) */
  heroFrom: string;
  heroTo: string;
  /** texto secundário sobre o degradê */
  onHeroMuted: string;
}

const light: Theme = {
  dark: false,
  bg: "#f3f3f0",
  surface: "#ffffff",
  surfaceAlt: "#ecebe6",
  border: "#e6e5e0",
  text: "#0e0e10",
  textSecondary: "#4a4a4f",
  textMuted: "#67676d",
  primary: "#4338ca",
  onPrimary: "#ffffff",
  primaryFill: "#4338ca",
  dangerFill: "#c4302f",
  danger: "#c4302f",
  warning: "#8f5a00",
  success: "#12794f",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  other: "#9a9992",
  planned: "#e08a12",
  heroFrom: "#1e1b4b",
  heroTo: "#4338ca",
  onHeroMuted: "#c7d2fe",
};

const dark: Theme = {
  dark: true,
  bg: "#0a0a0c",
  surface: "#141418",
  surfaceAlt: "#1d1d23",
  border: "#25252c",
  text: "#f2f2f4",
  textSecondary: "#b9b9c2",
  textMuted: "#8a8a94",
  primary: "#a5a6ff",
  onPrimary: "#ffffff",
  primaryFill: "#4f46e5",
  dangerFill: "#c4302f",
  danger: "#e66767",
  warning: "#e0a03a",
  success: "#3fbf8c",
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  other: "#6f6e68",
  planned: "#f0a030",
  heroFrom: "#312e81",
  heroTo: "#16143a",
  onHeroMuted: "#c7d2fe",
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
export const radius = { sm: 10, md: 14, lg: 20, xl: 28 } as const;
