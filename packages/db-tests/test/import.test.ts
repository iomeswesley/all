import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { processStatement } from "../../../supabase/functions/parse-statement/process.ts";
import { addUser, asUser, createDb } from "./harness.ts";
import { sqlStore } from "./sql-store.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const fixtures = path.join(root, "fixtures/santander");
const months = fs.readdirSync(fixtures).filter((f) => f.endsWith(".items.json")).map((f) => f.slice(0, 7)).sort();
const items = (m: string) => JSON.parse(fs.readFileSync(path.join(fixtures, `${m}.items.json`), "utf8"));

let db: PGlite;
let ana: string, bia: string;
let household: string;

const sha = (n: string) => `sha-${n}`;
const input = (m: string, over: Record<string, unknown> = {}) => ({ items: items(m), sha256: sha(m), filePath: `${household}/${m}.pdf`, userId: ana, ...over });

beforeAll(async () => {
  db = await createDb();
  ana = await addUser(db, "ana@example.com");
  bia = await addUser(db, "bia@example.com");
  household = await asUser(db, ana, async () => (await db.query<{ id: string }>("select public.create_household('Casal', 'Ana') as id")).rows[0]!.id);
  const token = await asUser(db, ana, async () => (await db.query<{ t: string }>("select public.create_invite() as t")).rows[0]!.t);
  await asUser(db, bia, () => db.query("select public.accept_invite($1, 'Bia')", [token]));
});

describe("Edge Function: sincronia com o core", () => {
  it("a cópia em supabase/functions/_shared/core está em dia", () => {
    expect(() => execFileSync("node", [path.join(root, "scripts/sync-core-to-functions.mjs"), "--check"], { stdio: "pipe" })).not.toThrow();
  });
});

describe("importar fatura → conferir → confirmar (banco real)", () => {
  it("grava rascunho que passa em todas as constraints e bate com o declarado", async () => {
    const store = sqlStore(db, ana);
    const r = await processStatement(store, input("2026-09"));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.reconcile.status).toBe("ok");
    expect(r.replacedDraft).toBe(false);

    const [st] = (await db.query<any>("select status, declared_total_cents::int as d, computed_total_cents::int as c, reconcile_status, declared_future_cents::int as f from public.statements where id=$1", [r.statementId])).rows;
    expect(st).toEqual({ status: "needs_review", d: 672972, c: 672972, reconcile_status: "ok", f: 235044 });

    // soma = total, agora a partir do que está GRAVADO no banco
    const [sum] = (await db.query<any>(
      `select coalesce(sum(amount_cents) filter (where section <> 'pagamentos'),0)::int as despesas,
              -coalesce(sum(amount_cents) filter (where kind = 'pagamento'),0)::int as pagamentos,
              coalesce(sum(case when kind='parcela' then (installment_total - installment_n) * amount_cents end),0)::int as futuras
       from public.transactions where statement_id=$1`, [r.statementId])).rows;
    expect(sum).toEqual({ despesas: 672972, pagamentos: 713689, futuras: 235044 });

    // cartões descobertos na fatura viram account_cards (só 4 dígitos)
    const cards = (await db.query<any>("select last4 from public.account_cards order by last4")).rows.map((c) => c.last4);
    expect(cards).toEqual(["1111", "2222"]);

    // rascunho não entra no dashboard
    expect((await asUser(db, ana, () => db.query("select 1 from public.v_transactions"))).rows).toHaveLength(0);
  });

  it("mesmo arquivo de novo → duplicado, nada muda", async () => {
    const before = (await db.query<any>("select count(*)::int n from public.transactions")).rows[0].n;
    const r = await processStatement(sqlStore(db, bia), input("2026-09", { userId: bia }));
    expect(r.status).toBe("duplicate_file");
    expect((await db.query<any>("select count(*)::int n from public.transactions")).rows[0].n).toBe(before);
  });

  it("PDF regenerado do mesmo período (rascunho) substitui o rascunho sem duplicar", async () => {
    const before = (await db.query<any>("select id from public.statements")).rows[0].id;
    const r = await processStatement(sqlStore(db, ana), input("2026-09", { sha256: "outro-sha", filePath: `${household}/novo.pdf` }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.replacedDraft).toBe(true);
    expect(r.statementId).not.toBe(before);
    expect((await db.query<any>("select count(*)::int n from public.statements")).rows[0].n).toBe(1);
    expect((await db.query<any>("select count(*)::int n from public.transactions")).rows[0].n).toBe(r.transactionCount);
  });

  it("fatura confirmada não é sobrescrita", async () => {
    const id = (await db.query<any>("select id from public.statements")).rows[0].id;
    await asUser(db, ana, () => db.query("select public.confirm_statement($1)", [id]));
    const r = await processStatement(sqlStore(db, ana), input("2026-09", { sha256: "mais-um-sha" }));
    expect(r).toEqual({ status: "already_confirmed", statementId: id });
  });

  it("PDF que não é fatura Santander → unsupported (sem gravar nada)", async () => {
    const n = (await db.query<any>("select count(*)::int n from public.statements")).rows[0].n;
    const r = await processStatement(sqlStore(db, ana), { ...input("2026-09", { sha256: "x" }), items: [{ p: 1, x: 0, y: 0, w: 1, s: "Outro documento" }] });
    expect(r.status).toBe("unsupported");
    expect((await db.query<any>("select count(*)::int n from public.statements")).rows[0].n).toBe(n);
  });
});

describe("as 7 faturas no banco: nenhuma colisão de hash e totais por mês", () => {
  it("importa e confirma abr–out/26; os dois enxergam os mesmos números", async () => {
    for (const m of months.filter((m) => m !== "2026-09")) {
      const r = await processStatement(sqlStore(db, ana), input(m));
      expect(r.status, m).toBe("ok");
      if (r.status !== "ok") continue;
      expect(r.reconcile.canAutoConfirm, m).toBe(true);
      await asUser(db, ana, () => db.query("select public.confirm_statement($1)", [r.statementId]));
    }
    const totals = (id: string) => asUser(db, id, async () =>
      (await db.query<any>(
        `select statement_month, sum(amount_cents) filter (where section <> 'pagamentos')::int as total
         from public.v_transactions group by statement_month order by statement_month`)).rows);
    const a = await totals(ana);
    const b = await totals(bia);
    expect(b).toEqual(a);
    const declared = Object.fromEntries(months.map((m) => [m, JSON.parse(fs.readFileSync(path.join(fixtures, "expected", `${m}.json`), "utf8"))]));
    expect(a.map((r: any) => r.statement_month)).toEqual(months);
    for (const row of a) {
      const exp = declared[row.statement_month];
      expect(row.total, row.statement_month).toBe(exp.domesticExpensesCents + exp.foreignExpensesCents);
    }
  });

  it("correção vira regra e vale na próxima importação (categoria, dono)", async () => {
    // pega o maior estabelecimento ainda sem categoria
    const top = (await db.query<any>(
      `select description_raw, count(*)::int n from public.transactions where needs_review group by 1 order by n desc limit 1`)).rows[0];
    expect(top.n).toBeGreaterThan(2);
    const ids = (await db.query<any>("select id from public.transactions where description_raw = $1", [top.description_raw])).rows.map((r) => r.id);
    await asUser(db, bia, () => db.query("select public.save_rule_and_apply($1,'contains',2::smallint,$2,$3::uuid[])", [top.description_raw, bia, ids]));
    const fixed = (await db.query<any>("select distinct category_id, category_source, owner_user_id, needs_review from public.transactions where description_raw = $1", [top.description_raw])).rows;
    expect(fixed).toEqual([{ category_id: 2, category_source: "rule", owner_user_id: bia, needs_review: false }]);

    // reimporta um mês com outro PDF (rascunho novo não existe: apaga o confirmado para simular)
    await db.query("delete from public.statements where file_sha256 = $1", [sha("2026-10")]);
    const r = await processStatement(sqlStore(db, ana), input("2026-10", { sha256: "reimport" }));
    expect(r.status).toBe("ok");
    const again = (await db.query<any>(
      `select distinct category_id, category_source, owner_user_id from public.transactions t join public.statements s on s.id = t.statement_id
       where description_raw = $1 and s.file_sha256 = 'reimport'`, [top.description_raw])).rows;
    expect(again).toEqual([{ category_id: 2, category_source: "rule", owner_user_id: bia }]);
  });
});
