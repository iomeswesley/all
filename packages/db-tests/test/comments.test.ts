import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { notifyComment, type CommentNotifyStore } from "../../../supabase/functions/notify/comment.ts";
import type { PushSender } from "../../../supabase/functions/notify/process.ts";
import { addUser, asAnon, asUser, createDb, rejects } from "./harness.ts";

let db: PGlite;
let ana: string, bia: string, carlos: string;
let hA: string, hB: string;
let txShared: string, txAnaPrivate: string, txCarlos: string;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const comment = (user: string, h: string, tx: string, body = "o que foi isso?") =>
  asUser(db, user, async () => (await q("insert into public.tx_comments (household_id, transaction_id, author, body) values ($1,$2,$3,$4) returning *", [h, tx, user, body]))[0]);
const react = (user: string, h: string, tx: string, emoji: string) =>
  asUser(db, user, () => q("insert into public.tx_reactions (household_id, transaction_id, user_id, emoji) values ($1,$2,$3,$4) on conflict (transaction_id, user_id) do update set emoji = excluded.emoji returning *", [h, tx, user, emoji]));
const tx = async (user: string, h: string, hash: string, priv = false) => {
  const acc = (await q("select id from public.accounts where household_id = $1", [h]))[0].id;
  return asUser(db, user, async () => (await q(
    "insert into public.transactions (household_id, account_id, posted_on, description_raw, description_clean, amount_cents, kind, source, dedupe_hash, is_private, owner_user_id) values ($1,$2,'2026-10-01','IFOOD','iFood',8700,'avista','manual',$3,$4,$5) returning id",
    [h, acc, hash, priv, priv ? user : null],
  ))[0].id as string);
};

beforeAll(async () => {
  db = await createDb();
  [ana, bia, carlos] = await Promise.all(["ana", "bia", "carlos"].map((n) => addUser(db, `${n}@x.com`)));
  hA = await asUser(db, ana, async () => (await q("select public.create_household('A','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  hB = await asUser(db, carlos, async () => (await q("select public.create_household('B','Carlos') as id"))[0].id);
  txShared = await tx(ana, hA, "c1");
  txAnaPrivate = await tx(ana, hA, "c2", true);
  txCarlos = await tx(carlos, hB, "c3");
});

describe("comentários", () => {
  it("o casal comenta e lê; o autor é registrado e o texto é validado", async () => {
    const c = await comment(ana, hA, txShared);
    expect(c.author).toBe(ana);
    await comment(bia, hA, txShared, "  mercado do mês  ");
    const seen = await asUser(db, bia, () => q("select body from public.tx_comments where transaction_id = $1 order by created_at, body", [txShared]));
    expect(seen).toHaveLength(2);
    expect(await rejects(comment(ana, hA, txShared, "   "))).toBe(true);
    expect(await rejects(comment(ana, hA, txShared, "x".repeat(501)))).toBe(true);
    expect((await comment(ana, hA, txShared, "x".repeat(500))).body).toHaveLength(500);
    // não dá para comentar em nome do outro
    expect(await rejects(asUser(db, bia, () => q("insert into public.tx_comments (household_id, transaction_id, author, body) values ($1,$2,$3,'oi')", [hA, txShared, ana])))).toBe(true);
  });

  it("só o autor edita (marca edited_at) e apaga o próprio comentário", async () => {
    const c = await comment(ana, hA, txShared, "original");
    expect((await asUser(db, bia, () => db.query("update public.tx_comments set body = 'hackeado' where id = $1", [c.id]))).affectedRows).toBe(0);
    expect((await asUser(db, bia, () => db.query("delete from public.tx_comments where id = $1", [c.id]))).affectedRows).toBe(0);
    const [edited] = await asUser(db, ana, () => q("update public.tx_comments set body = 'editado' where id = $1 returning body, edited_at", [c.id]));
    expect(edited.body).toBe("editado");
    expect(edited.edited_at).not.toBeNull();
    // casal/lançamento não mudam
    expect(await rejects(asUser(db, ana, () => q("update public.tx_comments set transaction_id = $2 where id = $1", [c.id, txAnaPrivate])))).toBe(true);
    expect((await asUser(db, ana, () => db.query("delete from public.tx_comments where id = $1", [c.id]))).affectedRows).toBe(1);
  });

  it("gasto pessoal 🔒: o par não vê nem cria comentários nele; o dono vê", async () => {
    await comment(ana, hA, txAnaPrivate, "nota só minha");
    expect(await asUser(db, bia, () => q("select * from public.tx_comments where transaction_id = $1", [txAnaPrivate]))).toEqual([]);
    expect(await rejects(comment(bia, hA, txAnaPrivate))).toBe(true);
    expect(await rejects(react(bia, hA, txAnaPrivate, "👍"))).toBe(true);
    expect(await asUser(db, ana, () => q("select body from public.tx_comments where transaction_id = $1", [txAnaPrivate]))).toEqual([{ body: "nota só minha" }]);
  });

  it("lançamento que vira pessoal depois: os comentários do par somem para o par", async () => {
    const t = await tx(ana, hA, "c4");
    await comment(bia, hA, t, "isso é seu?");
    await asUser(db, ana, () => q("update public.transactions set is_private = true, owner_user_id = $2 where id = $1", [t, ana]));
    expect(await asUser(db, bia, () => q("select * from public.tx_comments where transaction_id = $1", [t]))).toEqual([]);
    expect(await asUser(db, ana, () => q("select body from public.tx_comments where transaction_id = $1", [t]))).toEqual([{ body: "isso é seu?" }]);
  });

  it("outro casal não vê, não altera e não comenta; nem com o household_id trocado", async () => {
    expect(await asUser(db, carlos, () => q("select * from public.tx_comments"))).toEqual([]);
    expect(await asUser(db, carlos, () => q("select * from public.tx_reactions"))).toEqual([]);
    expect((await asUser(db, carlos, () => db.query("update public.tx_comments set body = 'x'"))).affectedRows).toBe(0);
    expect((await asUser(db, carlos, () => db.query("delete from public.tx_comments"))).affectedRows).toBe(0);
    expect(await rejects(comment(carlos, hA, txShared))).toBe(true);
    expect(await rejects(comment(carlos, hB, txShared))).toBe(true); // lançamento de outro casal com o próprio casal
    expect(await rejects(comment(ana, hA, txCarlos))).toBe(true);
  });

  it("anônimo não lê nem grava", async () => {
    expect(await asAnon(db, () => q("select * from public.tx_comments")).catch(() => [])).toEqual([]);
    expect(await asAnon(db, () => q("select * from public.tx_reactions")).catch(() => [])).toEqual([]);
    expect(await rejects(asAnon(db, () => q("insert into public.tx_comments (household_id, transaction_id, body) values ($1,$2,'x')", [hA, txShared])))).toBe(true);
  });
});

describe("reações", () => {
  it("lista fechada, uma por pessoa por lançamento (trocar substitui)", async () => {
    await react(ana, hA, txShared, "👍");
    await react(ana, hA, txShared, "❤️");
    await react(bia, hA, txShared, "😬");
    const rows = await asUser(db, bia, () => q("select user_id, emoji from public.tx_reactions where transaction_id = $1 order by emoji", [txShared]));
    expect(rows).toHaveLength(2);
    expect(rows.find((r: any) => r.user_id === ana).emoji).toBe("❤️");
    expect(await rejects(react(ana, hA, txShared, "🔥"))).toBe(true);
  });

  it("só a própria pessoa troca ou tira a sua reação", async () => {
    expect((await asUser(db, bia, () => db.query("update public.tx_reactions set emoji = '✅' where user_id = $1", [ana]))).affectedRows).toBe(0);
    expect((await asUser(db, bia, () => db.query("delete from public.tx_reactions where user_id = $1", [ana]))).affectedRows).toBe(0);
    expect((await asUser(db, ana, () => db.query("delete from public.tx_reactions where user_id = $1 and transaction_id = $2", [ana, txShared]))).affectedRows).toBe(1);
  });
});

/** CommentNotifyStore em SQL puro, como o usuário (RLS valendo). */
function commentStore(user: string): CommentNotifyStore {
  const run = <T = any>(sql: string, params: unknown[] = []) => asUser(db, user, async () => (await db.query<T>(sql, params)).rows);
  return {
    me: async () => (await run("select user_id as \"userId\", household_id as \"householdId\", display_name as \"displayName\" from public.members where user_id = $1", [user]))[0],
    pushTokens: async () => run("select user_id as \"userId\", token from public.push_tokens"),
    transaction: async (id) => (await run("select id, to_char(posted_on,'YYYY-MM-DD') as \"postedOn\", description_clean as \"descriptionClean\", amount_cents::int as \"amountCents\", category_id as \"categoryId\", needs_review as \"needsReview\", is_private as \"isPrivate\", source from public.transactions where id = $1", [id]))[0] ?? null,
    comment: async (id) => (await run("select id, author as \"authorId\", transaction_id as \"transactionId\", body, notified_at as \"notifiedAt\" from public.tx_comments where id = $1", [id]))[0] ?? null,
    markCommentNotified: async (id) => { await run("update public.tx_comments set notified_at = now() where id = $1", [id]); },
  };
}

describe("aviso ao par (função notify)", () => {
  const sent: { to: string; title: string; body: string }[] = [];
  const sender: PushSender = { send: async (m) => { sent.push(...m); } };

  beforeAll(async () => {
    await asUser(db, ana, () => q("insert into public.push_tokens (user_id, household_id, token) values ($1,$2,'ExponentPushToken[ana]')", [ana, hA]));
    await asUser(db, bia, () => q("insert into public.push_tokens (user_id, household_id, token) values ($1,$2,'ExponentPushToken[bia]')", [bia, hA]));
  });

  it("avisa só o par, uma vez só; ninguém dispara o aviso do comentário alheio", async () => {
    sent.length = 0;
    const c = await comment(ana, hA, txShared, "pedimos duas vezes?");
    expect(await notifyComment(commentStore(bia), sender, c.id)).toEqual({ status: "not_found" });
    expect(await notifyComment(commentStore(ana), sender, c.id)).toEqual({ status: "ok", pushSent: 1, partnerNotified: true });
    expect(sent).toEqual([expect.objectContaining({ to: "ExponentPushToken[bia]", title: "Ana comentou em iFood R$ 87,00", body: "pedimos duas vezes?" })]);
    expect(await notifyComment(commentStore(ana), sender, c.id)).toEqual({ status: "already_notified" });
    expect(sent).toHaveLength(1);
    // limpar notified_at não reabre o aviso
    await asUser(db, ana, () => q("update public.tx_comments set notified_at = null where id = $1", [c.id]));
    expect(await notifyComment(commentStore(ana), sender, c.id)).toEqual({ status: "already_notified" });
  });

  it("gasto pessoal: nada sai", async () => {
    sent.length = 0;
    const c = await comment(ana, hA, txAnaPrivate, "lembrete");
    expect(await notifyComment(commentStore(ana), sender, c.id)).toEqual({ status: "ok", pushSent: 0, partnerNotified: false });
    expect(sent).toEqual([]);
  });
});

describe("ciclo de vida", () => {
  it("apagar o lançamento apaga a conversa; apagar o usuário não é bloqueado (autor vira null)", async () => {
    const t = await tx(ana, hA, "c5");
    await comment(bia, hA, t);
    await react(bia, hA, t, "🤔");
    await asUser(db, ana, () => q("delete from public.transactions where id = $1", [t]));
    expect((await q("select count(*)::int as n from public.tx_comments where transaction_id = $1", [t]))[0].n).toBe(0);
    expect((await q("select count(*)::int as n from public.tx_reactions where transaction_id = $1", [t]))[0].n).toBe(0);

    await react(bia, hA, txShared, "✅");
    await q("delete from auth.users where id = $1", [bia]);
    expect((await q("select count(*)::int as n from public.tx_comments where author is null"))[0].n).toBeGreaterThan(0);
    expect((await q("select count(*)::int as n from public.tx_reactions where user_id is null"))[0].n).toBe(1);
  });
});
