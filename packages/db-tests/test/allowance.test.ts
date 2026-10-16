import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { buildManualRow } from "../../core/src/manual.ts";
import { addUser, asAnon, asUser, createDb, rejects } from "./harness.ts";

let db: PGlite;
let ana: string, bia: string, carlos: string;
let hA: string, hB: string;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

async function manual(user: string, h: string, cents: number, date: string, owner: string | null, isPrivate: boolean, kind = "avista") {
  const account = await asUser(db, user, async () => (await q("select public.ensure_cash_account() as id"))[0].id);
  const row: Record<string, unknown> = {
    ...buildManualRow({ description: `Item ${cents}`, amountCents: Math.abs(cents), date, method: "pix", categoryId: 8, ownerUserId: owner, isPrivate }, crypto.randomUUID()),
    amount_cents: cents,
    kind,
  };
  const full = { household_id: h, account_id: account, description_clean: `Pix · Item ${cents}`, ...row };
  const keys = Object.keys(full);
  await asUser(db, user, () => q(`insert into public.transactions (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(full)));
}

const status = (user: string, month = "2026-10") => asUser(db, user, () => q("select user_id, display_name, monthly_cents::int as lim, used_cents::int as used, is_me from public.allowance_status($1)", [month]));
const setAllowance = (user: string, h: string, target: string, cents: number) =>
  asUser(db, user, () => q("insert into public.member_allowances (household_id, user_id, monthly_cents) values ($1,$2,$3) on conflict (household_id, user_id) do update set monthly_cents = excluded.monthly_cents", [h, target, cents]));

/** Fatura do cartão (competência = mês do vencimento) com 1 gasto pessoal da Bia comprado no mês anterior. */
async function cardStatement(due: string, status: "confirmed" | "needs_review", cents: number) {
  const acc = (await q("select id from public.accounts where household_id = $1 and institution <> 'manual' limit 1", [hA]))[0].id;
  const st = await asUser(db, bia, async () => (await q(
    `insert into public.statements (household_id, account_id, closing_date, due_date, declared_total_cents, computed_total_cents, reconcile_status, file_path, file_sha256, created_by, status)
     values ($1,$2,$3::date - 6,$3,1,1,'ok',$4,$5,$6,$7) returning id`, [hA, acc, due, `${hA}/${due}.pdf`, `sha-${due}`, bia, status]))[0].id);
  await asUser(db, bia, () => q(
    `insert into public.transactions (household_id, account_id, statement_id, posted_on, description_raw, description_clean, amount_cents, kind, dedupe_hash, is_private, owner_user_id, category_id)
     values ($1,$2,$3,$4::date - 30,'LOJA','LOJA',$5,'avista',$6,true,$7,8)`, [hA, acc, st, due, cents, `h-${due}`, bia]));
}

beforeAll(async () => {
  db = await createDb();
  [ana, bia, carlos] = await Promise.all(["ana", "bia", "carlos"].map((n) => addUser(db, `${n}@x.com`)));
  hA = await asUser(db, ana, async () => (await q("select public.create_household('A','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  hB = await asUser(db, carlos, async () => (await q("select public.create_household('B','Carlos') as id"))[0].id);

  // Bia: fatura confirmada que vence em outubro (compra de setembro conta em outubro) e uma ainda em revisão (não conta)
  await cardStatement("2026-10-06", "confirmed", 2500);
  await cardStatement("2026-11-06", "needs_review", 7000);
  // Bia: 2 Pix pessoais em outubro, 1 estorno pessoal, 1 em setembro e 1 gasto "dela" não pessoal
  await manual(bia, hA, 12000, "2026-10-03", bia, true);
  await manual(bia, hA, 8000, "2026-10-12", bia, true);
  await manual(bia, hA, -1500, "2026-10-13", bia, true, "estorno");
  await manual(bia, hA, 50000, "2026-09-20", bia, true);
  await manual(bia, hA, 30000, "2026-10-05", bia, false);
  // Ana: 1 pessoal em outubro
  await manual(ana, hA, 4500, "2026-10-08", ana, true);
  // Carlos (outro casal): pessoal em outubro
  await manual(carlos, hB, 99900, "2026-10-08", carlos, true);
});

describe("mesada pessoal 🔒", () => {
  it("o casal define a mesada de cada um (acordo do casal) e registra quem mudou", async () => {
    await setAllowance(ana, hA, ana, 50000);
    await setAllowance(ana, hA, bia, 40000);
    await setAllowance(bia, hA, bia, 45000); // Bia ajusta a própria
    const rows = await asUser(db, ana, () => q("select user_id, monthly_cents::int as c, updated_by from public.member_allowances order by c"));
    expect(rows).toEqual([{ user_id: bia, c: 45000, updated_by: bia }, { user_id: ana, c: 50000, updated_by: ana }]);
  });

  it("quem mudou é gravado pelo banco, sem como atribuir a mudança ao par", async () => {
    await asUser(db, ana, () => q("update public.member_allowances set monthly_cents = 46000, updated_by = $1 where user_id = $1", [bia]));
    expect(await asUser(db, bia, () => q("select monthly_cents::int as c, updated_by from public.member_allowances where user_id = $1", [bia]))).toEqual([{ c: 46000, updated_by: ana }]);
    await setAllowance(bia, hA, bia, 45000);
  });

  it("valores inválidos e quem não é do casal são recusados", async () => {
    expect(await rejects(setAllowance(ana, hA, ana, -1))).toBe(true);
    expect(await rejects(setAllowance(ana, hA, carlos, 1000))).toBe(true); // Carlos não é membro do casal A
    expect(await rejects(setAllowance(carlos, hA, ana, 1))).toBe(true); // RLS
  });

  it("devolve limite e usado do mês, contando só o gasto pessoal (estorno abate)", async () => {
    const rows = await status(ana);
    expect(rows).toEqual([
      { user_id: ana, display_name: "Ana", lim: 50000, used: 4500, is_me: true },
      { user_id: bia, display_name: "Bia", lim: 45000, used: 21000, is_me: false }, // 12000 + 8000 − 1500 + 2500 (cartão)
    ]);
    expect((await status(ana, "2026-09")).find((r) => r.user_id === bia)?.used).toBe(50000);
  });

  it("o par vê o total, mas nunca os itens pessoais", async () => {
    const items = await asUser(db, ana, () => q("select amount_cents::int as c from public.transactions where owner_user_id = $1 and is_private", [bia]));
    expect(items).toEqual([]);
    const viaView = await asUser(db, ana, () => q("select amount_cents::int as c from public.v_transactions where owner_user_id = $1 and is_private", [bia]));
    expect(viaView).toEqual([]);
    // a função não expõe colunas de item (descrição, data, valor individual)
    const cols = Object.keys((await status(ana))[0]!);
    expect(cols.sort()).toEqual(["display_name", "is_me", "lim", "used", "user_id"].sort());
  });

  it("isolamento entre casais", async () => {
    const rows = await status(carlos);
    expect(rows).toEqual([{ user_id: carlos, display_name: "Carlos", lim: null, used: 99900, is_me: true }]);
    expect(await asUser(db, carlos, () => q("select * from public.member_allowances"))).toEqual([]);
    expect((await asUser(db, carlos, () => db.query("update public.member_allowances set monthly_cents = 1"))).affectedRows).toBe(0);
    expect((await asUser(db, carlos, () => db.query("delete from public.member_allowances"))).affectedRows).toBe(0);
    expect((await status(ana)).every((r) => r.user_id !== carlos)).toBe(true);
  });

  it("mês inválido não devolve nada", async () => {
    expect(await status(ana, "2026-13")).toEqual([]);
    expect(await status(ana, "x' or 1=1")).toEqual([]);
  });

  it("anônimo não chama a função nem lê a tabela", async () => {
    expect(await rejects(asAnon(db, () => q("select * from public.allowance_status('2026-10')")), "permission denied")).toBe(true);
    const anon = await asAnon(db, () => q("select * from public.member_allowances")).catch(() => []);
    expect(anon).toEqual([]);
  });

  it("some quando a pessoa sai do casal; excluir quem alterou não quebra (updated_by vira null)", async () => {
    await asUser(db, bia, () => q("select public.leave_household()"));
    expect(await q("select user_id from public.member_allowances")).toEqual([{ user_id: ana }]);
    await setAllowance(ana, hA, ana, 60000);
    await q("update public.member_allowances set updated_by = $1", [bia]);
    await q("delete from auth.users where id = $1", [bia]);
    expect(await q("select updated_by, monthly_cents::int as c from public.member_allowances")).toEqual([{ updated_by: null, c: 60000 }]);
    await q("delete from public.transactions where is_private and owner_user_id = $1", [ana]); // como faz o fluxo de excluir conta
    await q("delete from auth.users where id = $1", [ana]); // membro excluído leva a mesada junto
    expect(await q("select * from public.member_allowances")).toEqual([]);
  });
});
