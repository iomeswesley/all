// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
import { CATEGORIES, CAT, categoryName } from "./categories.ts";
import { addDays, addMonths, formatBrDate, formatMonthLong, formatMonthShort, isoDate, monthKey, splitIso, type IsoDate } from "./dates.ts";
import { formatBRL } from "./money.ts";
import { decodeDescription, merchantKey, stripAccents } from "./normalize.ts";
import type { TxKind } from "./parsers/types.ts";

export interface QueryTx {
  statementMonth: string;
  postedOn: IsoDate;
  descriptionRaw: string;
  merchantName?: string | null;
  amountCents: number;
  categoryId: number | null;
  kind: TxKind;
  ownerUserId: string | null;
  hiddenAggregate?: boolean;
}

export interface QueryContext {
  /** "hoje" de referência (injetado para os testes serem determinísticos) */
  today: IsoDate;
  meUserId: string;
  partnerUserId?: string | null;
  partnerName?: string | null;
}

export type Intent = "total" | "count" | "top" | "average" | "list";

export interface Period {
  from: IsoDate | null;
  to: IsoDate | null;
  label: string;
}

export interface ParsedQuery {
  intent: Intent;
  period: Period;
  categoryIds: number[];
  /** palavras do estabelecimento citadas na pergunta que existem nos dados */
  merchantTerms: string[];
  unknownTerms: string[];
  owner: "me" | "partner" | "shared" | null;
  recognized: boolean;
}

export interface QueryResult {
  ok: boolean;
  parsed: ParsedQuery;
  totalCents: number;
  count: number;
  averagePerMonthCents: number;
  byMonth: { month: string; cents: number }[];
  topMerchants: { label: string; cents: number; count: number }[];
  rows: QueryTx[];
  answer: string;
  notes: string[];
}

const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTH_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const CATEGORY_WORDS: [RegExp, number][] = [
  [/\b(restaurantes?|delivery|ifood|lanches?|lanchonetes?|pizzas?|padarias?|cafes?|comer fora|comida pronta)\b/, CAT.RESTAURANTE],
  [/\b(mercados?|supermercados?|atacado|feira|hortifruti|compras de casa)\b/, CAT.MERCADO],
  [/\b(combustivel|gasolina|etanol|postos?|transporte|uber|estacionamento|pedagio)\b/, CAT.TRANSPORTE],
  [/\b(assinaturas?|streaming|netflix|spotify)\b/, CAT.ASSINATURAS],
  [/\b(saude|farmacias?|remedios?|medic[oa]s?|consultas?|exames?|dentista|academia)\b/, CAT.SAUDE],
  [/\b(casa|moveis|reforma|contas da casa|energia|agua|internet)\b/, CAT.CASA],
  [/\b(compras|varejo|lojas?|roupas?|eletronicos?)\b/, CAT.COMPRAS],
  [/\b(lazer|cinema|ingressos?|shows?|passeios?|jogos?|diversao)\b/, CAT.LAZER],
  [/\b(educacao|escola|faculdade|cursos?|livros?)\b/, CAT.EDUCACAO],
  [/\b(viagens?|viajar|hotel|hoteis|hospedagem|passagens?)\b/, CAT.VIAGEM],
  [/\b(tarifas?|encargos?|juros|iof|anuidade|multas?|taxas?)\b/, CAT.SERVICOS],
];

/** Palavras que citam um tipo de estabelecimento/encargo específico: se existirem nos dados, filtram pelo nome. */
const SPECIFIC_WORDS = new Set(["padaria", "ifood", "uber", "netflix", "spotify", "farmacia", "academia", "cafe", "pizza", "lanche", "cinema", "hotel", "iof", "juros", "anuidade", "multa", "estacionamento", "gasolina", "etanol"]);
const stem = (w: string) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);

const STOPWORDS = new Set([
  "quanto", "quantos", "quantas", "quantas vezes", "gastamos", "gastei", "gastou", "gasto", "gastos", "gastar", "total", "com", "em", "no", "na", "nos", "nas", "de", "do", "da", "dos", "das",
  "o", "a", "os", "as", "um", "uma", "e", "ou", "para", "por", "pra", "que", "qual", "quais", "onde", "mais", "maiores", "maior", "menor", "desde", "ate", "entre", "este", "esta", "neste", "nesta",
  "mes", "meses", "ano", "anos", "passado", "passados", "ultimo", "ultimos", "ultima", "ultimas", "vez", "vezes", "foi", "foram", "fomos", "temos", "tem", "ja", "nosso", "nossa", "nossos", "nossas",
  "meu", "meus", "minha", "minhas", "eu", "dela", "dele", "media", "mensal", "por", "gastamos", "paguei", "pagamos", "comprei", "compramos", "mostre", "mostra", "liste", "listar", "me", "pergunta",
  "lancamentos", "compras", "pedidos", "ticket", "medio", "top", "ranking", "valor", "valores", "reais", "r", "hoje", "atual", "anterior", "qual foi", "fiz", "fizemos", "tudo", "todos", "todas",
]);

const normalize = (q: string) => stripAccents(q.toLowerCase()).replace(/[?!.,;:()]/g, " ").replace(/\s+/g, " ").trim();

function monthIndex(word: string): number {
  const full = MONTHS.indexOf(word);
  if (full >= 0) return full + 1;
  const abbr = MONTH_ABBR.indexOf(word);
  return abbr >= 0 ? abbr + 1 : 0;
}

const MONTH_RE = `(${[...MONTHS, ...MONTH_ABBR].join("|")})`;

/** Mês mais recente (até hoje) com esse número; com ano explícito usa o ano. */
function resolveMonth(month: number, year: number | null, today: IsoDate): { y: number; m: number } {
  const t = splitIso(today);
  if (year) return { y: year, m: month };
  return { y: month <= t.m ? t.y : t.y - 1, m: month };
}

const firstDay = (y: number, m: number) => isoDate(y, m, 1);
const lastDay = (y: number, m: number) => addDays(addMonths(firstDay(y, m), 1), -1);

export function parsePeriod(q: string, today: IsoDate): Period | null {
  const t = splitIso(today);
  const year = (/\b(20\d{2})\b/.exec(q)?.[1] ?? null) as string | null;
  const y = year ? Number(year) : null;

  let m = new RegExp(`\\b(?:de|entre)\\s+${MONTH_RE}(?:\\s+de\\s+(20\\d{2}))?\\s+(?:a|ate|e)\\s+${MONTH_RE}(?:\\s+de\\s+(20\\d{2}))?`).exec(q);
  if (m) {
    const a = resolveMonth(monthIndex(m[1]!), m[2] ? Number(m[2]) : y, today);
    const b = resolveMonth(monthIndex(m[3]!), m[4] ? Number(m[4]) : y, today);
    return { from: firstDay(a.y, a.m), to: lastDay(b.y, b.m), label: `de ${formatMonthLong(`${a.y}-${String(a.m).padStart(2, "0")}`)} a ${formatMonthLong(`${b.y}-${String(b.m).padStart(2, "0")}`)}` };
  }
  m = new RegExp(`\\bdesde\\s+(?:o\\s+mes\\s+de\\s+|o\\s+inicio\\s+de\\s+)?${MONTH_RE}(?:\\s+de\\s+(20\\d{2}))?`).exec(q);
  if (m) {
    const r = resolveMonth(monthIndex(m[1]!), m[2] ? Number(m[2]) : y, today);
    return { from: firstDay(r.y, r.m), to: today, label: `desde ${formatMonthLong(`${r.y}-${String(r.m).padStart(2, "0")}`)}` };
  }
  m = /\bdesde\s+(?:o\s+)?(?:comeco|inicio)\s+do\s+ano\b/.exec(q);
  if (m) return { from: firstDay(t.y, 1), to: today, label: `desde o início de ${t.y}` };
  m = /\bdesde\s+(20\d{2})\b/.exec(q);
  if (m) return { from: firstDay(Number(m[1]), 1), to: today, label: `desde ${m[1]}` };
  m = new RegExp(`\\b(?:em|no mes de|durante|de|na fatura de)\\s+${MONTH_RE}(?:\\s+de\\s+(20\\d{2}))?`).exec(q);
  if (m) {
    const r = resolveMonth(monthIndex(m[1]!), m[2] ? Number(m[2]) : y, today);
    return { from: firstDay(r.y, r.m), to: lastDay(r.y, r.m), label: `em ${formatMonthLong(`${r.y}-${String(r.m).padStart(2, "0")}`)}` };
  }
  m = /\b(?:nos\s+)?ultimos?\s+(\d{1,2})\s+mes(?:es)?\b/.exec(q);
  if (m) {
    const n = Math.min(Math.max(Number(m[1]), 1), 36);
    return { from: addMonths(firstDay(t.y, t.m), -(n - 1)), to: today, label: `nos últimos ${n} meses` };
  }
  if (/\b(mes passado|ultimo mes|mes anterior)\b/.test(q)) {
    const prev = addMonths(firstDay(t.y, t.m), -1);
    const p = splitIso(prev);
    return { from: prev, to: lastDay(p.y, p.m), label: `no mês passado (${formatMonthLong(monthKey(prev))})` };
  }
  if (/\b(este mes|neste mes|mes atual|esse mes)\b/.test(q)) return { from: firstDay(t.y, t.m), to: lastDay(t.y, t.m), label: `neste mês (${formatMonthLong(monthKey(today))})` };
  if (/\b(ano passado)\b/.test(q)) return { from: firstDay(t.y - 1, 1), to: isoDate(t.y - 1, 12, 31), label: `em ${t.y - 1}` };
  if (/\b(este ano|neste ano|esse ano)\b/.test(q)) return { from: firstDay(t.y, 1), to: today, label: `em ${t.y}` };
  if (y) return { from: firstDay(y, 1), to: isoDate(y, 12, 31), label: `em ${y}` };
  return null;
}

/** Parcelas contam no mês em que foram cobradas; as demais, na data da compra. */
export function effectiveDate(t: Pick<QueryTx, "kind" | "postedOn" | "statementMonth">): IsoDate {
  if (t.kind === "parcela") return `${monthKey(addMonths(`${t.statementMonth}-15`, -1))}-15`;
  return t.postedOn;
}

export function parseQuery(question: string, txs: readonly QueryTx[], ctx: QueryContext): ParsedQuery {
  const q = normalize(question);
  const period = parsePeriod(q, ctx.today) ?? { from: null, to: null, label: "em todo o período importado" };

  let intent: Intent = "total";
  if (/\bquant[ao]s?\s+(vezes|pedidos|compras|lancamentos|idas)\b/.test(q) || /\bquantas vezes\b/.test(q)) intent = "count";
  else if (/\b(onde|em que|quais)\b.*\b(mais|maiores)\b|\bmaiores gastos\b|\bmaiores\b|\btop\b|\branking\b/.test(q)) intent = "top";
  else if (/\b(media|ticket medio)\b/.test(q)) intent = "average";
  else if (/\b(liste|listar|mostre|mostra|quais foram)\b/.test(q)) intent = "list";

  const haystack = txs
    .filter((t) => !t.hiddenAggregate)
    .map((t) => `${stripAccents((t.merchantName ?? "").toLowerCase())} ${merchantKey(t.descriptionRaw).toLowerCase()} ${stripAccents(decodeDescription(t.descriptionRaw).display.toLowerCase())}`);
  const inData = (w: string) => haystack.some((h) => h.includes(w));

  const categoryIds: number[] = [];
  const merchantTerms: string[] = [];
  const consumed = new Set<string>();
  for (const [re, id] of CATEGORY_WORDS) {
    const hits = q.match(new RegExp(re, "g")) ?? [];
    if (hits.length === 0) continue;
    hits.forEach((w) => w.split(" ").forEach((x) => consumed.add(x)));
    const specific = hits.map(stem).filter((w) => SPECIFIC_WORDS.has(w) && inData(w));
    if (specific.length > 0) merchantTerms.push(...specific); // “IOF”, “ifood”… filtram pelo nome
    if (specific.length < hits.length || specific.length === 0) { if (!categoryIds.includes(id)) categoryIds.push(id); }
  }

  let owner: ParsedQuery["owner"] = null;
  const partner = ctx.partnerName ? stripAccents(ctx.partnerName.toLowerCase()) : null;
  if (/\b(meu|meus|minha|minhas|eu)\b/.test(q)) owner = "me";
  else if (/\b(dela|dele)\b/.test(q) || (partner && new RegExp(`\\b${partner}\\b`).test(q))) owner = "partner";
  else if (/\bcompartilhad[oa]s?\b/.test(q)) owner = "shared";

  // Termos que sobram na pergunta e que existem nos dados também viram filtro de estabelecimento.
  const words = q.split(" ").filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !consumed.has(w) && !/^\d+$/.test(w) && monthIndex(w) === 0 && !(partner && w === partner));
  const unknownTerms: string[] = [];
  for (const w of words) (inData(w) ? merchantTerms : unknownTerms).push(w);

  const recognized = categoryIds.length > 0 || merchantTerms.length > 0 || /\b(quanto|quant[ao]s|gast|total|onde|media|liste|mostre|maiores)\b/.test(q);
  return { intent, period, categoryIds, merchantTerms, unknownTerms, owner, recognized };
}

/** Responde usando apenas os lançamentos recebidos (os do próprio casal visíveis a quem pergunta). */
export function runQuery(question: string, txs: readonly QueryTx[], ctx: QueryContext): QueryResult {
  const parsed = parseQuery(question, txs, ctx);
  const notes: string[] = [];
  const empty = (answer: string): QueryResult => ({ ok: false, parsed, totalCents: 0, count: 0, averagePerMonthCents: 0, byMonth: [], topMerchants: [], rows: [], answer, notes });
  if (!parsed.recognized) return empty("Não entendi a pergunta. Tente, por exemplo: “quanto gastamos com restaurante desde julho?” ou “quais foram os maiores gastos em agosto?”.");

  const real = txs.filter((t) => !t.hiddenAggregate && t.kind !== "pagamento");
  if (txs.some((t) => t.hiddenAggregate)) notes.push("Gastos pessoais do seu par aparecem só nos totais do painel, não nesta busca.");
  const generalized = [...normalize(question).matchAll(/\b(padarias?|ifood|farmacias?|academia|cafes?|pizzas?|lanches?|cinema|hotel)\b/g)].map((m) => m[1]!).filter((w) => !parsed.merchantTerms.includes(stem(w)) && parsed.categoryIds.length > 0);
  if (generalized.length > 0) notes.push(`Não achei “${generalized.join(", ")}” pelo nome; considerei a categoria inteira (${parsed.categoryIds.map(categoryName).join(", ")}).`);
  if (parsed.unknownTerms.length > 0) notes.push(`Não achei estabelecimento parecido com “${parsed.unknownTerms.join(", ")}”; ignorei esse termo.`);

  const rows = real.filter((t) => {
    const d = effectiveDate(t);
    if (parsed.period.from && d < parsed.period.from) return false;
    if (parsed.period.to && d > parsed.period.to) return false;
    if (parsed.categoryIds.length > 0 && !parsed.categoryIds.includes(t.categoryId ?? CAT.OUTROS)) return false;
    if (parsed.owner === "me" && t.ownerUserId !== ctx.meUserId) return false;
    if (parsed.owner === "partner" && t.ownerUserId !== (ctx.partnerUserId ?? "—")) return false;
    if (parsed.owner === "shared" && t.ownerUserId !== null) return false;
    if (parsed.merchantTerms.length > 0) {
      const h = `${stripAccents((t.merchantName ?? "").toLowerCase())} ${merchantKey(t.descriptionRaw).toLowerCase()} ${stripAccents(decodeDescription(t.descriptionRaw).display.toLowerCase())}`;
      if (!parsed.merchantTerms.every((w) => h.includes(w))) return false;
    }
    return true;
  });

  const total = rows.reduce((a, t) => a + t.amountCents, 0);
  const byMonthMap = new Map<string, number>();
  const merchants = new Map<string, { label: string; cents: number; count: number }>();
  for (const t of rows) {
    const mk = monthKey(effectiveDate(t));
    byMonthMap.set(mk, (byMonthMap.get(mk) ?? 0) + t.amountCents);
    const key = merchantKey(t.descriptionRaw);
    const cur = merchants.get(key) ?? { label: t.merchantName ?? decodeDescription(t.descriptionRaw).display, cents: 0, count: 0 };
    cur.cents += t.amountCents;
    cur.count += 1;
    merchants.set(key, cur);
  }
  const byMonth = [...byMonthMap.entries()].sort().map(([month, cents]) => ({ month, cents }));
  const monthsCount = Math.max(byMonth.length, 1);
  const average = Math.round(total / monthsCount);
  const top = [...merchants.values()].sort((a, b) => b.cents - a.cents).slice(0, 5);

  const what = [
    parsed.categoryIds.length ? parsed.categoryIds.map(categoryName).join(" e ") : null,
    parsed.merchantTerms.length ? `“${parsed.merchantTerms.join(" ")}”` : null,
  ].filter(Boolean).join(" · ") || "tudo";
  const whose = parsed.owner === "me" ? "Você gastou" : parsed.owner === "partner" ? `${ctx.partnerName ?? "Seu par"} gastou` : parsed.owner === "shared" ? "Gastos compartilhados somam" : "Vocês gastaram";
  const span = byMonth.length > 1 ? ` (${formatMonthShort(byMonth[0]!.month)} a ${formatMonthShort(byMonth[byMonth.length - 1]!.month)})` : "";

  let answer: string;
  if (rows.length === 0) {
    answer = `Não encontrei lançamentos de ${what} ${parsed.period.label}.`;
  } else if (parsed.intent === "count") {
    answer = `${rows.length} lançamento${rows.length > 1 ? "s" : ""} de ${what} ${parsed.period.label}, somando ${formatBRL(total)}.`;
  } else if (parsed.intent === "average") {
    answer = `Média de ${formatBRL(average)} por mês em ${what} ${parsed.period.label}${span}. Total: ${formatBRL(total)} em ${rows.length} lançamentos (ticket médio ${formatBRL(Math.round(total / rows.length))}).`;
  } else if (parsed.intent === "top") {
    answer = `Onde mais gastaram${what === "tudo" ? "" : ` em ${what}`} ${parsed.period.label}: ${top.map((m, i) => `${i + 1}. ${m.label} ${formatBRL(m.cents)}`).join("; ")}.`;
  } else if (parsed.intent === "list") {
    answer = `${rows.length} lançamentos de ${what} ${parsed.period.label}, total ${formatBRL(total)}. Os maiores: ${[...rows].sort((a, b) => b.amountCents - a.amountCents).slice(0, 5).map((t) => `${decodeDescription(t.descriptionRaw).display} ${formatBRL(t.amountCents)} (${formatBrDate(t.postedOn)})`).join("; ")}.`;
  } else {
    answer = `${whose} ${formatBRL(total)} com ${what} ${parsed.period.label}${span} — ${rows.length} lançamento${rows.length > 1 ? "s" : ""}.`;
  }
  return { ok: true, parsed, totalCents: total, count: rows.length, averagePerMonthCents: average, byMonth, topMerchants: top, rows: [...rows].sort((a, b) => b.postedOn.localeCompare(a.postedOn)).slice(0, 50), answer, notes };
}

export const CATEGORY_NAMES_FOR_HELP = CATEGORIES.map((c) => c.name);
