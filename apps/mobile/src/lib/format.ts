import { formatBRL as coreBRL, formatNumberBR as coreNumber, formatUSD as coreUSD } from "@financas/core";
import { privacyOn } from "./prefs";

/**
 * Formatação de valores para a TELA. No modo privacidade nada numérico aparece.
 * (Componentes que mostram valores assinam `usePrefs()` para redesenhar ao alternar.)
 */
const MASK = "••••";

export const formatBRL = (cents: number): string => (privacyOn ? `${cents < 0 ? "-" : ""}R$ ${MASK}` : coreBRL(cents));
export const formatUSD = (cents: number): string => (privacyOn ? `US$ ${MASK}` : coreUSD(cents));
/** Para campos de edição: nunca mascarado. */
export const formatNumberBR = coreNumber;
