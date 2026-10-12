import type { PGlite } from "@electric-sql/pglite";
import type { Store, StatementRow, TransactionRow } from "../../../supabase/functions/parse-statement/process.ts";
import { asUser } from "./harness.ts";

/** Store de teste: mesma interface da Edge Function, mas direto em SQL, como o usuário (RLS valendo). */
export function sqlStore(db: PGlite, user: string): Store {
  const run = <T = any>(sql: string, params: unknown[] = []) => asUser(db, user, async () => (await db.query<T>(sql, params)).rows);
  const insert = async (table: string, row: Record<string, unknown>, returning = "id") => {
    const keys = Object.keys(row);
    const vals = keys.map((k) => (row[k] !== null && typeof row[k] === "object" ? JSON.stringify(row[k]) : row[k]));
    const rows = await run(`insert into public.${table} (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning ${returning}`, vals);
    return rows[0];
  };
  return {
    householdId: async () => (await run("select household_id from public.members"))[0].household_id,
    findStatementBySha: async (h, sha) => (await run("select id, status from public.statements where household_id=$1 and file_sha256=$2", [h, sha]))[0] ?? null,
    findStatementByDue: async (h, a, d) => (await run("select id, status from public.statements where household_id=$1 and account_id=$2 and due_date=$3", [h, a, d]))[0] ?? null,
    deleteStatement: async (id) => { await run("delete from public.statements where id=$1", [id]); },
    account: async (h, accountId) => {
      const rows = accountId
        ? await run("select id, kind from public.accounts where household_id=$1 and id=$2 and institution <> 'manual'", [h, accountId])
        : await run("select id, kind from public.accounts where household_id=$1 and institution <> 'manual' order by kind, created_at limit 1", [h]);
      if (!rows[0]) throw new Error("Conta não encontrada.");
      return rows[0];
    },
    cardOwners: async (a) => Object.fromEntries((await run("select last4, holder_user_id from public.account_cards where account_id=$1", [a])).map((r: any) => [r.last4, r.holder_user_id])),
    categorizeContext: async (h) => ({
      rules: (await run("select pattern, match_type, category_id, owner_user_id, priority from public.rules where household_id=$1", [h])).map((r: any) => ({ pattern: r.pattern, matchType: r.match_type, categoryId: r.category_id, ownerUserId: r.owner_user_id, priority: r.priority })),
    }),
    existingHashes: async (h, hashes) => new Set((await run("select dedupe_hash from public.transactions where household_id=$1 and dedupe_hash = any($2::text[])", [h, hashes])).map((r: any) => r.dedupe_hash)),
    insertStatement: async (row: StatementRow) => (await insert("statements", row as unknown as Record<string, unknown>)).id,
    insertTransactions: async (rows: TransactionRow[]) => { for (const r of rows) await insert("transactions", r as unknown as Record<string, unknown>); },
    upsertCards: async (rows) => { for (const r of rows) await run("insert into public.account_cards (account_id, household_id, last4, label) values ($1,$2,$3,$4) on conflict do nothing", [r.account_id, r.household_id, r.last4, r.label]); },
  };
}

