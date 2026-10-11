export interface Category {
  id: number;
  slug: string;
  name: string;
  /** cor usada nos gráficos (paleta sequencial estável por categoria) */
  color: string;
}

/** As 12 categorias fixas. Os ids são os mesmos do seed SQL. */
export const CATEGORIES: readonly Category[] = [
  { id: 1, slug: "mercado", name: "Alimentação (mercado)", color: "#2E9E6B" },
  { id: 2, slug: "restaurante", name: "Alimentação (restaurante/delivery)", color: "#F28E2B" },
  { id: 3, slug: "transporte", name: "Transporte/combustível", color: "#4E79A7" },
  { id: 4, slug: "assinaturas", name: "Assinaturas", color: "#B07AA1" },
  { id: 5, slug: "saude", name: "Saúde", color: "#E15759" },
  { id: 6, slug: "casa", name: "Casa", color: "#9C755F" },
  { id: 7, slug: "compras", name: "Compras/varejo", color: "#EDC948" },
  { id: 8, slug: "lazer", name: "Lazer", color: "#FF9DA7" },
  { id: 9, slug: "educacao", name: "Educação", color: "#76B7B2" },
  { id: 10, slug: "viagem", name: "Viagem", color: "#59A14F" },
  { id: 11, slug: "servicos", name: "Serviços/tarifas", color: "#7F7F7F" },
  { id: 12, slug: "outros", name: "Outros", color: "#BAB0AC" },
] as const;

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
export const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export const CAT = {
  MERCADO: 1,
  RESTAURANTE: 2,
  TRANSPORTE: 3,
  ASSINATURAS: 4,
  SAUDE: 5,
  CASA: 6,
  COMPRAS: 7,
  LAZER: 8,
  EDUCACAO: 9,
  VIAGEM: 10,
  SERVICOS: 11,
  OUTROS: 12,
} as const;

export function categoryName(id: number | null | undefined): string {
  return (id != null && CATEGORY_BY_ID.get(id)?.name) || "Sem categoria";
}
