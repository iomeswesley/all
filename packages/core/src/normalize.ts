/**
 * Normalização e decodificação de descrições de fatura.
 * Ex.: "IFD*MARIA IZABEL NUNES DA" → iFood · Maria Izabel Nunes da
 */

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Chave de comparação: maiúsculas, sem acento, espaços colapsados, "*" sem espaço ao redor. */
export function matchKey(raw: string): string {
  return stripAccents(raw)
    .toUpperCase()
    .replace(/\s*\*\s*/g, "*")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Processor {
  /** prefixo antes do "*" */
  prefix: string;
  name: string;
  /** "marketplace": o prefixo já diz o tipo de gasto (ex.: iFood); "facilitator": só intermedia o pagamento */
  type: "marketplace" | "facilitator";
}

export const PROCESSORS: readonly Processor[] = [
  { prefix: "IFD", name: "iFood", type: "marketplace" },
  { prefix: "MP", name: "Mercado Pago", type: "facilitator" },
  { prefix: "ZP", name: "Zoop", type: "facilitator" },
  { prefix: "CAPPTA", name: "Cappta", type: "facilitator" },
  { prefix: "PG", name: "PagSeguro", type: "facilitator" },
  { prefix: "PAG", name: "PagSeguro", type: "facilitator" },
  { prefix: "SUMUP", name: "SumUp", type: "facilitator" },
  { prefix: "STONE", name: "Stone", type: "facilitator" },
  { prefix: "SHOPEE", name: "Shopee", type: "marketplace" },
  { prefix: "UBER", name: "Uber", type: "marketplace" },
  { prefix: "PAYPAL", name: "PayPal", type: "facilitator" },
  { prefix: "EBANX", name: "Ebanx", type: "facilitator" },
  { prefix: "HOTMART", name: "Hotmart", type: "facilitator" },
];

export interface DecodedDescription {
  /** chave de comparação da descrição inteira */
  key: string;
  /** chave sem o prefixo do intermediário (o vendedor) */
  vendorKey: string;
  processor: Processor | null;
  /** nome para exibir */
  display: string;
}

const SMALL_WORDS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "EM", "A", "O"]);

/** "DIVINA GULA PAES E D" → "Divina Gula Paes e D" */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w, i) => {
      if (/\d/.test(w)) return w.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(w.toUpperCase())) return w;
      if (w.length === 1) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export function decodeDescription(raw: string): DecodedDescription {
  const key = matchKey(raw);
  const star = key.indexOf("*");
  if (star > 0) {
    const prefix = key.slice(0, star);
    const processor = PROCESSORS.find((p) => p.prefix === prefix) ?? null;
    if (processor) {
      const vendorKey = key.slice(star + 1).replace(/^\*+/, "").trim();
      const cleanedVendor = vendorKey.replace(/\s*PENDING$/, "").trim();
      const vendor = cleanedVendor ? titleCase(cleanedVendor.replace(/\*/g, " ")) : "";
      let display: string;
      if (!vendor) display = processor.name;
      else if (processor.type === "marketplace") display = `${processor.name} · ${vendor}`;
      else display = `${vendor} (${processor.name})`;
      return { key, vendorKey, processor, display };
    }
  }
  return { key, vendorKey: key, processor: null, display: titleCase(key.replace(/\*/g, " ")) };
}

/**
 * Chave estável do estabelecimento para dicionário, recorrência e deduplicação:
 * remove números de loja/filial no fim ("SAMS JOINVILLE AM 4672" → "SAMS JOINVILLE AM").
 */
export function merchantKey(raw: string): string {
  return decodeDescription(raw)
    .key.replace(/\*/g, " ")
    .replace(/\bPENDING\b/g, "")
    .replace(/\s+\d{2,}$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
