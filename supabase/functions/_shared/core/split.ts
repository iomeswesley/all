// ARQUIVO COPIADO de packages/core/src (node scripts/sync-core-to-functions.mjs). Não edite aqui.
/**
 * Divisão do "nosso" e acerto de contas do casal.
 *
 * - Regra do casal por mês (vale para o mês e os seguintes até mudar): 50/50, proporcional à renda
 *   (percentual inteiro, calculado no banco sem expor o salário) ou percentual personalizado.
 * - Exceção por lançamento: "100% meu", 70/30… e/ou "quem pagou" diferente do automático.
 * - Lançamento com dono (meu/dela) pago pelo outro: o dono deve 100%.
 * - Gasto pessoal 🔒 nunca entra (o banco já não o devolve).
 * - Tudo em centavos inteiros: a soma das partes é SEMPRE igual ao total (maiores restos).
 *
 * Saldo de cada pessoa = pagou − deveria ter pago (+ acertos enviados − acertos recebidos).
 * Positivo = tem a receber; negativo = deve. A soma dos saldos do casal é sempre zero.
 */

export type SplitMode = "equal" | "income" | "custom";

/** Regra gravada para um mês ("YYYY-MM"); vale até a próxima regra. */
export interface SplitRule {
  month: string;
  mode: SplitMode;
  /** no modo personalizado: de quem é `customPct` (o outro fica com o resto) */
  customUserId: string | null;
  customPct: number | null;
}

/** Exceção de um lançamento. */
export interface SplitOverride {
  /** quem fica com `sharePct` (o outro, com o resto); null = segue a regra do casal */
  shareUserId: string | null;
  sharePct: number | null;
  /** "quem pagou" informado à mão (vence o automático) */
  paidByUserId: string | null;
}

export interface SplitEntry {
  id: string;
  /** competência "YYYY-MM" (mês do vencimento da fatura ou do pagamento) */
  month: string;
  postedOn: string;
  description: string;
  amountCents: number;
  /** null = "nosso" */
  ownerUserId: string | null;
  /** quem pagou (já resolvido: exceção → dono do cartão → quem lançou → quem importou); null = desconhecido */
  payerUserId: string | null;
  override: SplitOverride | null;
}

export interface SplitSettlement {
  id: string;
  fromUserId: string | null;
  toUserId: string | null;
  amountCents: number;
  /** ISO "YYYY-MM-DD" */
  settledOn: string;
  note?: string | null;
  createdBy?: string | null;
}

export type Shares = Record<string, number>;

const isPct = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100;

/**
 * Reparte `total` centavos conforme os pesos, com soma exata (método dos maiores restos).
 * Empate de resto: vence o índice menor (determinístico). Total negativo (estorno) é repartido
 * como o positivo e invertido, para o estorno desfazer exatamente a compra.
 */
export function allocateCents(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total)) throw new Error(`Total deve ser inteiro em centavos: ${total}`);
  if (weights.length === 0) throw new Error("Sem pesos para repartir");
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new Error("Pesos devem ser inteiros ≥ 0");
  const sumW = weights.reduce((a, w) => a + w, 0);
  if (sumW === 0) throw new Error("A soma dos pesos deve ser maior que zero");
  if (total < 0) return allocateCents(-total, weights).map((v) => (v === 0 ? 0 : -v));
  // Aritmética inteira com BigInt: sem erro de ponto flutuante mesmo com valores grandes.
  const T = BigInt(total);
  const S = BigInt(sumW);
  const base = weights.map((w) => (T * BigInt(w)) / S);
  const rest = weights.map((w, i) => ({ i, r: (T * BigInt(w)) % S }));
  let left = total - base.reduce((a, b) => a + Number(b), 0);
  rest.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const out = base.map(Number);
  for (let k = 0; left > 0; k++, left--) out[rest[k]!.i]! += 1;
  return out;
}

/** Percentual inteiro de `a` na renda do casal (arredonda meio para cima) — igual à função do banco. */
export function incomePct(aCents: number, bCents: number): number | null {
  const total = aCents + bCents;
  if (aCents < 0 || bCents < 0 || total <= 0) return null;
  return Math.floor((200 * aCents + total) / (2 * total));
}

/** Regra em vigor no mês: a última gravada com mês ≤ `month`; sem nenhuma, 50/50. */
export function ruleForMonth(rules: readonly SplitRule[], month: string): SplitRule {
  let best: SplitRule | null = null;
  for (const r of rules) if (r.month <= month && (!best || r.month > best.month)) best = r;
  return best ?? { month: "0000-00", mode: "equal", customUserId: null, customPct: null };
}

/** Peso inteiro (0–100) de cada pessoa segundo a regra. Sem os dados necessários, cai no 50/50. */
export function ruleShares(rule: SplitRule, users: readonly [string, string], incomeShares: Shares | null): { shares: Shares; fallback: boolean } {
  const [a, b] = users;
  const pair = (pa: number): Shares => ({ [a]: pa, [b]: 100 - pa });
  if (rule.mode === "custom" && isPct(rule.customPct) && rule.customUserId !== null && users.includes(rule.customUserId)) {
    return { shares: rule.customUserId === a ? pair(rule.customPct) : pair(100 - rule.customPct), fallback: false };
  }
  if (rule.mode === "income" && incomeShares && isPct(incomeShares[a]) && isPct(incomeShares[b]) && incomeShares[a]! + incomeShares[b]! === 100) {
    return { shares: pair(incomeShares[a]!), fallback: false };
  }
  return { shares: pair(50), fallback: rule.mode !== "equal" };
}

/** Quanto cada pessoa deve arcar de UM lançamento. */
export function entryOwed(entry: SplitEntry, users: readonly [string, string], shares: Shares): Shares {
  const [a, b] = users;
  const o = entry.override;
  let wa: number;
  if (o && o.shareUserId !== null && users.includes(o.shareUserId) && isPct(o.sharePct)) {
    wa = o.shareUserId === a ? o.sharePct : 100 - o.sharePct;
  } else if (entry.ownerUserId !== null && users.includes(entry.ownerUserId)) {
    wa = entry.ownerUserId === a ? 100 : 0;
  } else {
    wa = shares[a] ?? 50;
  }
  const [ca, cb] = wa === 0 ? [0, entry.amountCents] : wa === 100 ? [entry.amountCents, 0] : allocateCents(entry.amountCents, [wa, 100 - wa]);
  return { [a]: ca!, [b]: cb! };
}

export interface MonthSplit {
  month: string;
  rule: SplitRule;
  shares: Shares;
  /** regra pede renda/percentual que falta: usado 50/50 */
  fallback: boolean;
  totalCents: number;
  count: number;
  paid: Shares;
  owed: Shares;
  /** pagou − deveria (no mês) */
  net: Shares;
  /** acertos registrados no mês (+ enviou, − recebeu) */
  settled: Shares;
  /** saldo acumulado ao fim do mês */
  balance: Shares;
}

export interface Debt {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export interface SplitResult {
  users: [string, string];
  months: MonthSplit[];
  /** saldo atual (positivo = tem a receber) */
  balance: Shares;
  debt: Debt | null;
  /** lançamentos fora da conta por não se saber quem pagou */
  unknownPayer: SplitEntry[];
  /** lançamentos que entraram na conta, por mês */
  entriesByMonth: Record<string, SplitEntry[]>;
}

const zero = (users: readonly string[]): Shares => Object.fromEntries(users.map((u) => [u, 0]));

/**
 * Lançamento sem efeito no acerto: tem dono, sem exceção de divisão, e foi pago pelo próprio dono
 * (ou não se sabe quem pagou — presume-se o dono).
 */
function irrelevant(e: SplitEntry): boolean {
  const hasShare = e.override !== null && e.override.shareUserId !== null && isPct(e.override.sharePct);
  return !hasShare && e.ownerUserId !== null && (e.payerUserId === null || e.ownerUserId === e.payerUserId);
}

export function computeSplit(input: {
  users: readonly [string, string];
  entries: readonly SplitEntry[];
  rules: readonly SplitRule[];
  incomeShares: Shares | null;
  settlements: readonly SplitSettlement[];
}): SplitResult {
  const users: [string, string] = [input.users[0], input.users[1]];
  if (users[0] === users[1]) throw new Error("O acerto precisa de duas pessoas diferentes");
  const unknownPayer: SplitEntry[] = [];
  const entriesByMonth: Record<string, SplitEntry[]> = {};
  for (const e of input.entries) {
    if (!Number.isSafeInteger(e.amountCents) || e.amountCents === 0) continue;
    const payer = e.override?.paidByUserId && users.includes(e.override.paidByUserId) ? e.override.paidByUserId : e.payerUserId;
    const entry = payer === e.payerUserId ? e : { ...e, payerUserId: payer };
    if (irrelevant(entry)) continue;
    if (entry.payerUserId === null || !users.includes(entry.payerUserId)) {
      unknownPayer.push(entry);
      continue;
    }
    (entriesByMonth[entry.month] ??= []).push(entry);
  }

  const settlementsByMonth: Record<string, SplitSettlement[]> = {};
  for (const s of input.settlements) {
    if (!s.fromUserId || !s.toUserId || s.fromUserId === s.toUserId) continue;
    if (!users.includes(s.fromUserId) || !users.includes(s.toUserId) || !(s.amountCents > 0)) continue;
    (settlementsByMonth[s.settledOn.slice(0, 7)] ??= []).push(s);
  }

  const monthKeys = [...new Set([...Object.keys(entriesByMonth), ...Object.keys(settlementsByMonth)])].sort();
  const running = zero(users);
  const months: MonthSplit[] = monthKeys.map((month) => {
    const rule = ruleForMonth(input.rules, month);
    const { shares, fallback } = ruleShares(rule, users, input.incomeShares);
    const paid = zero(users);
    const owed = zero(users);
    let totalCents = 0;
    const list = entriesByMonth[month] ?? [];
    for (const e of list) {
      totalCents += e.amountCents;
      paid[e.payerUserId!]! += e.amountCents;
      const o = entryOwed(e, users, shares);
      for (const u of users) owed[u]! += o[u]!;
    }
    const settled = zero(users);
    for (const s of settlementsByMonth[month] ?? []) {
      settled[s.fromUserId!]! += s.amountCents;
      settled[s.toUserId!]! -= s.amountCents;
    }
    const net = zero(users);
    for (const u of users) {
      net[u] = paid[u]! - owed[u]!;
      running[u]! += net[u]! + settled[u]!;
    }
    return { month, rule, shares, fallback, totalCents, count: list.length, paid, owed, net, settled, balance: { ...running } };
  });

  return { users, months, balance: { ...running }, debt: debtFrom(users, running), unknownPayer, entriesByMonth };
}

/** Quem deve a quem, a partir dos saldos. */
export function debtFrom(users: readonly [string, string], balance: Shares): Debt | null {
  const [a, b] = users;
  const ba = balance[a] ?? 0;
  if (ba === 0) return null;
  return ba < 0 ? { fromUserId: a, toUserId: b, amountCents: -ba } : { fromUserId: b, toUserId: a, amountCents: ba };
}

/** "Bia deve R$ 380,00 a Ana" / "Você deve…" / "Tudo certo". */
export function debtSentence(debt: Debt | null, nameOf: (userId: string, asObject: boolean) => string, formatMoney: (cents: number) => string): string {
  if (!debt) return "Tudo certo entre vocês";
  return `${nameOf(debt.fromUserId, false)} deve ${formatMoney(debt.amountCents)} a ${nameOf(debt.toUserId, true)}`;
}
