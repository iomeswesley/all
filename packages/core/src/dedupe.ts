import { merchantKey } from "./normalize.ts";
import { sha256Hex } from "./sha256.ts";

export interface HashableTx {
  postedOn: string;
  descriptionRaw: string;
  amountCents: number;
  installmentN: number | null;
  installmentTotal: number | null;
  cardLast4: string | null;
  kind: string;
}

/** Descrição normalizada usada na identidade do lançamento. */
export function descriptionIdentity(raw: string): string {
  return merchantKey(raw);
}

/**
 * Hash de deduplicação: conta + data + valor + descrição normalizada + parcela + cartão.
 * O `ordinal` diferencia compras idênticas legítimas (dois cafés iguais no mesmo dia).
 */
export function dedupeHash(accountId: string, tx: HashableTx, ordinal: number): string {
  return sha256Hex(
    [
      accountId,
      tx.postedOn,
      tx.amountCents,
      descriptionIdentity(tx.descriptionRaw),
      tx.installmentN ?? "",
      tx.installmentTotal ?? "",
      tx.cardLast4 ?? "",
      tx.kind,
      ordinal,
    ].join("|"),
  );
}

/** Calcula o hash de cada lançamento, atribuindo ordinais aos idênticos. A ordem de entrada é preservada. */
export function assignDedupeHashes<T extends HashableTx>(accountId: string, txs: readonly T[]): (T & { dedupeHash: string })[] {
  const seen = new Map<string, number>();
  return txs.map((tx) => {
    const base = [tx.postedOn, tx.amountCents, descriptionIdentity(tx.descriptionRaw), tx.installmentN, tx.installmentTotal, tx.cardLast4, tx.kind].join("|");
    const ordinal = (seen.get(base) ?? 0) + 1;
    seen.set(base, ordinal);
    return { ...tx, dedupeHash: dedupeHash(accountId, tx, ordinal) };
  });
}
