import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { computeSplit, type SplitEntry } from "../../core/src/split.ts";
import { addUser, asAnon, asUser, createDb, rejects } from "./harness.ts";

let db: PGlite;
let ana: string, bia: string, carlos: string;
let hA: string, hB: string, accA: string, stA: string;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

/** Lançamento de cartão na fatura confirmada do casal A. */
const cardTx = (user: string, desc: string, cents: number, last4: string | null, extra: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = {
    household_id: hA, account_id: accA, statement_id: stA, card_last4: last4, posted_on: "2026-09-02",
    description_raw: desc, description_clean: desc, amount_cents: cents, kind: "avista", dedupe_hash: desc, ...extra,
  };
  const keys = Object.keys(row);
  return asUser(db, user, async () => (await q(`insert into public.transactions (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(row)))[0].id as string);
};
const entries = async (user: string) => asUser(db, user, async () => (await q("select public.split_entries() as e"))[0].e as any[]);
const toEntry = (r: any): SplitEntry => ({
  id: r.id, month: r.month, postedOn: r.posted_on, description: r.description, amountCents: Number(r.amount_cents), ownerUserId: r.owner_user_id, payerUserId: r.payer_user_id,
  override: r.share_pct === null && r.paid_by_user_id === null ? null : { shareUserId: r.share_user_id, sharePct: r.share_pct, paidByUserId: r.paid_by_user_id },
});

beforeAll(async () => {
  db = await createDb();
  [ana, bia, carlos] = await Promise.all(["ana", "bia", "carlos"].map((n) => addUser(db, `${n}@x.com`)));
  hA = await asUser(db, ana, async () => (await q("select public.create_household('A','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  hB = await asUser(db, carlos, async () => (await q("select public.create_household('B','Carlos') as id"))[0].id);
  accA = (await q("select id from public.accounts where household_id=$1", [hA]))[0].id;
  stA = await asUser(db, bia, async () => (await q(
    `insert into public.statements (household_id, account_id, closing_date, due_date, declared_total_cents, computed_total_cents, reconcile_status, file_path, file_sha256, created_by, confirmed_by, status)
     values ($1,$2,'2026-09-30','2026-10-06',1,1,'ok',$3,'s1',$4,$4,'confirmed') returning id`, [hA, accA, `${hA}/a.pdf`, bia]))[0].id);
  await asUser(db, ana, () => q("insert into public.account_cards (account_id, household_id, last4, holder_user_id) values ($1,$2,'1111',$3), ($1,$2,'2222',null)", [accA, hA, ana]));
});

describe("lançamentos do acerto e quem pagou", () => {
  it("dono do cartão paga; cartão sem dono → quem importou; manual → quem lançou; pessoal 🔒 e pagamento ficam fora", async () => {
    await cardTx(ana, "MERCADO", 40000, "1111"); // cartão da Ana
    await cardTx(ana, "FARMACIA", 10000, "2222"); // cartão sem dono: quem importou (Bia)
    await cardTx(ana, "PRESENTE", 9000, "1111", { owner_user_id: ana, is_private: true }); // 🔒 nunca entra
    await cardTx(ana, "PAGAMENTO", -50000, null, { kind: "pagamento", section: "pagamentos" });
    await cardTx(ana, "CAFE ANA", 1500, "1111", { owner_user_id: ana }); // dono pagou o próprio: irrelevante
    await cardTx(ana, "ACADEMIA BIA", 12000, "1111", { owner_user_id: bia }); // Ana pagou o da Bia
    const cash = await asUser(db, bia, async () => (await q("select public.ensure_cash_account() as id"))[0].id);
    await asUser(db, bia, () => q(
      "insert into public.transactions (household_id, account_id, posted_on, description_raw, description_clean, amount_cents, kind, source, dedupe_hash) values ($1,$2,'2026-10-03','DIARISTA','Diarista',18000,'avista','manual','m1')", [hA, cash]));

    const rows = await entries(ana);
    const byDesc = Object.fromEntries(rows.map((r) => [r.description, r]));
    expect(Object.keys(byDesc).sort()).toEqual(["ACADEMIA BIA", "Diarista", "FARMACIA", "MERCADO"]);
    expect(byDesc.MERCADO).toMatchObject({ payer_user_id: ana, month: "2026-10" });
    expect(byDesc.FARMACIA.payer_user_id).toBe(bia);
    expect(byDesc.Diarista).toMatchObject({ payer_user_id: bia, month: "2026-10" });
    // a Bia vê exatamente o mesmo (o gasto pessoal da Ana não aparece para ninguém aqui)
    expect((await entries(bia)).map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort());

    const res = computeSplit({ users: [ana, bia], entries: rows.map(toEntry), rules: [], incomeShares: null, settlements: [] });
    // nosso: 40000 (Ana) + 10000 (Bia) + 18000 (Bia) = 68000 → 34000 cada; Ana pagou 40000 e +12000 da Bia
    expect(res.months[0]).toMatchObject({ paid: { [ana]: 52000, [bia]: 28000 }, owed: { [ana]: 34000, [bia]: 46000 } });
    expect(res.debt).toEqual({ fromUserId: bia, toUserId: ana, amountCents: 18000 });
  });

  it("exceção por lançamento: 100% de uma pessoa e 'quem pagou' à mão", async () => {
    const id = (await entries(ana)).find((r) => r.description === "FARMACIA").id;
    await asUser(db, bia, () => q("insert into public.split_overrides (transaction_id, household_id, share_user_id, share_pct, paid_by_user_id) values ($1,$2,$3,100,$4)", [id, hA, bia, ana]));
    const r = (await entries(ana)).find((x) => x.id === id);
    expect(r).toMatchObject({ share_user_id: bia, share_pct: 100, payer_user_id: ana });
    expect(await rejects(asUser(db, bia, () => q("update public.split_overrides set share_pct = 101 where transaction_id = $1", [id])))).toBe(true);
  });

  it("não marca exceção no gasto pessoal do par nem em lançamento de outro casal", async () => {
    const priv = (await q("select id from public.transactions where description_raw = 'PRESENTE'"))[0].id;
    expect(await rejects(asUser(db, bia, () => q("insert into public.split_overrides (transaction_id, household_id, share_pct, share_user_id) values ($1,$2,50,$3)", [priv, hA, bia])))).toBe(true);
    const mercado = (await q("select id from public.transactions where description_raw = 'MERCADO'"))[0].id;
    expect(await rejects(asUser(db, carlos, () => q("insert into public.split_overrides (transaction_id, household_id, share_pct, share_user_id) values ($1,$2,50,$3)", [mercado, hB, carlos])))).toBe(true);
    expect(await rejects(asUser(db, carlos, () => q("insert into public.split_overrides (transaction_id, household_id, share_pct, share_user_id) values ($1,$2,50,$3)", [mercado, hA, carlos])))).toBe(true);
  });
});

describe("regra do casal e renda", () => {
  it("o casal grava a regra por mês; valores inválidos são recusados", async () => {
    await asUser(db, bia, () => q("insert into public.split_rules (household_id, month, mode, custom_user_id, custom_pct) values ($1,'2026-10-01','custom',$2,60)", [hA, bia]));
    expect(await asUser(db, ana, () => q("select mode, custom_pct, updated_by from public.split_rules"))).toEqual([{ mode: "custom", custom_pct: 60, updated_by: bia }]);
    expect(await rejects(asUser(db, ana, () => q("insert into public.split_rules (household_id, month, mode) values ($1,'2026-11-01','custom')", [hA])))).toBe(true);
    expect(await rejects(asUser(db, ana, () => q("insert into public.split_rules (household_id, month, mode) values ($1,'2026-11-15','equal')", [hA])))).toBe(true);
    expect(await rejects(asUser(db, ana, () => q("insert into public.split_rules (household_id, month, mode) values ($1,'2026-11-01','metade')", [hA])))).toBe(true);
  });

  it("o par não lê a renda do outro; só a proporção sai, e só quando os dois informaram", async () => {
    await asUser(db, ana, () => q("insert into public.member_incomes (household_id, income_cents) values ($1, 600000)", [hA]));
    let shares = await asUser(db, bia, () => q("select user_id, informed, share_pct from public.split_income_shares() order by user_id"));
    expect(shares.every((s: any) => s.share_pct === null)).toBe(true);
    expect(shares.find((s: any) => s.user_id === ana).informed).toBe(true);
    expect(shares.find((s: any) => s.user_id === bia).informed).toBe(false);

    await asUser(db, bia, () => q("insert into public.member_incomes (household_id, user_id, income_cents) values ($1, $2, 300000)", [hA, bia]));
    expect(await asUser(db, bia, () => q("select user_id, income_cents from public.member_incomes"))).toEqual([{ user_id: bia, income_cents: 300000 }]);
    expect(await asUser(db, ana, () => q("select income_cents from public.member_incomes"))).toEqual([{ income_cents: 600000 }]);
    // não grava nem altera a renda do outro
    expect(await rejects(asUser(db, ana, () => q("insert into public.member_incomes (household_id, user_id, income_cents) values ($1,$2,1)", [hA, bia])))).toBe(true);
    expect((await asUser(db, ana, () => db.query("update public.member_incomes set income_cents = 1 where user_id = $1", [bia]))).affectedRows).toBe(0);

    shares = await asUser(db, bia, () => q("select user_id, share_pct from public.split_income_shares()"));
    expect(Object.fromEntries(shares.map((s: any) => [s.user_id, s.share_pct]))).toEqual({ [ana]: 67, [bia]: 33 });
    expect(JSON.stringify(shares)).not.toMatch(/600000|300000/);
  });

  it("outro casal e anônimo não veem nada", async () => {
    for (const t of ["split_rules", "member_incomes", "split_overrides", "settlements"]) {
      expect(await asUser(db, carlos, () => q(`select * from public.${t}`))).toEqual([]);
      expect(await asAnon(db, () => q(`select * from public.${t}`)).catch(() => [])).toEqual([]);
    }
    expect(await asUser(db, carlos, async () => (await q("select public.split_entries() as e"))[0].e)).toEqual([]);
    expect((await asUser(db, carlos, () => q("select * from public.split_income_shares()"))).every((s: any) => s.share_pct === null)).toBe(true);
    expect(await rejects(asUser(db, carlos, () => q("insert into public.split_rules (household_id, month, mode) values ($1,'2026-12-01','equal')", [hA])))).toBe(true);
    expect(await rejects(asAnon(db, () => q("select public.split_entries()")), "permission denied")).toBe(true);
    expect(await rejects(asAnon(db, () => q("select * from public.split_income_shares()")), "permission denied")).toBe(true);
  });
});

describe("acertos registrados", () => {
  it("registra Pix feito fora do app; só entre membros; só quem registrou desfaz", async () => {
    const [s] = await asUser(db, bia, () => q("insert into public.settlements (household_id, from_user_id, to_user_id, amount_cents, settled_on) values ($1,$2,$3,18000,'2026-10-20') returning *", [hA, bia, ana]));
    expect(s.created_by).toBe(bia);
    expect(await asUser(db, ana, () => q("select amount_cents::int as c from public.settlements"))).toEqual([{ c: 18000 }]);
    expect(await rejects(asUser(db, bia, () => q("insert into public.settlements (household_id, from_user_id, to_user_id, amount_cents) values ($1,$2,$3,0)", [hA, bia, ana])))).toBe(true);
    expect(await rejects(asUser(db, bia, () => q("insert into public.settlements (household_id, from_user_id, to_user_id, amount_cents) values ($1,$2,$2,10)", [hA, bia])))).toBe(true);
    expect(await rejects(asUser(db, bia, () => q("insert into public.settlements (household_id, from_user_id, to_user_id, amount_cents) values ($1,$2,$3,10)", [hA, bia, carlos])))).toBe(true);
    expect(await rejects(asUser(db, bia, () => q("insert into public.settlements (household_id, from_user_id, to_user_id, amount_cents, created_by) values ($1,$2,$3,10,$3)", [hA, bia, ana])))).toBe(true);
    expect(await rejects(asUser(db, carlos, () => q("insert into public.settlements (household_id, from_user_id, to_user_id, amount_cents) values ($1,$2,$3,10)", [hA, bia, ana])))).toBe(true);
    expect((await asUser(db, ana, () => db.query("delete from public.settlements where id = $1", [s.id]))).affectedRows).toBe(0);
    expect((await asUser(db, ana, () => db.query("update public.settlements set amount_cents = 1"))).affectedRows).toBe(0);
    expect((await asUser(db, carlos, () => db.query("delete from public.settlements"))).affectedRows).toBe(0);
    expect((await asUser(db, bia, () => db.query("delete from public.settlements where id = $1", [s.id]))).affectedRows).toBe(1);
  });
});

describe("apagar usuário", () => {
  it("não é bloqueado: renda some, referências viram null", async () => {
    await asUser(db, bia, () => q("insert into public.settlements (household_id, from_user_id, to_user_id, amount_cents) values ($1,$2,$3,500)", [hA, bia, ana]));
    await q("delete from auth.users where id = $1", [bia]);
    expect(await q("select count(*)::int as n from public.member_incomes where user_id = $1", [bia])).toEqual([{ n: 0 }]);
    expect(await q("select from_user_id, created_by from public.settlements")).toEqual([{ from_user_id: null, created_by: null }]);
    expect(await q("select custom_user_id, updated_by from public.split_rules")).toEqual([{ custom_user_id: null, updated_by: null }]);
    expect(await q("select share_user_id, paid_by_user_id from public.split_overrides")).toEqual([{ share_user_id: null, paid_by_user_id: ana }]);
  });
});
