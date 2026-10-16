import { describe, expect, it } from "vitest";
import {
  commentMessage, initialSeen, isReaction, markAllSeen, markThreadSeen, normalizeComment, pruneSeen, REACTIONS,
  summarizeReactions, threadSummaries, toggleReaction, unreadThreads, type CommentLite,
} from "../src/comments.ts";

describe("comentários: validação e reações", () => {
  it("normaliza o texto e recusa vazio ou acima de 500", () => {
    expect(normalizeComment("  oi  ")).toBe("oi");
    expect(normalizeComment("   ")).toBeNull();
    expect(normalizeComment("x".repeat(500))).toHaveLength(500);
    expect(normalizeComment("x".repeat(501))).toBeNull();
  });

  it("lista fechada de reações e alternância (mesma tira, outra troca)", () => {
    expect(REACTIONS).toEqual(["👍", "❤️", "😬", "🤔", "✅"]);
    expect(isReaction("❤️")).toBe(true);
    expect(isReaction("🔥")).toBe(false);
    expect(toggleReaction(null, "👍")).toBe("👍");
    expect(toggleReaction("👍", "👍")).toBeNull();
    expect(toggleReaction("👍", "😬")).toBe("😬");
  });

  it("resume reações na ordem da lista, marcando a minha", () => {
    const r = summarizeReactions([{ emoji: "✅", userId: "b" }, { emoji: "👍", userId: "a" }, { emoji: "👍", userId: "b" }], "a");
    expect(r).toEqual([{ emoji: "👍", count: 2, mine: true }, { emoji: "✅", count: 1, mine: false }]);
  });

  it("contadores por lançamento", () => {
    const s = threadSummaries(
      [{ transactionId: "t1" }, { transactionId: "t1" }, { transactionId: "t2" }],
      [{ transactionId: "t1", emoji: "✅" }, { transactionId: "t1", emoji: "👍" }, { transactionId: "t1", emoji: "👍" }, { transactionId: "t3", emoji: "🔥" }],
    );
    expect(s.t1).toEqual({ comments: 2, reactions: ["👍", "✅"] });
    expect(s.t2).toEqual({ comments: 1, reactions: [] });
    expect(s.t3).toEqual({ comments: 0, reactions: [] });
  });
});

describe("comentários: não lidos", () => {
  const now = "2026-10-16T12:00:00.000Z";
  const c = (id: string, tx: string, author: string | null, createdAt: string): CommentLite => ({ id, transactionId: tx, authorId: author, createdAt });
  const list = [
    c("1", "t1", "bia", "2026-10-16T10:00:00.000Z"),
    c("2", "t1", "bia", "2026-10-16T11:00:00.000Z"),
    c("3", "t1", "ana", "2026-10-16T11:30:00.000Z"), // meu
    c("4", "t2", "bia", "2026-10-15T09:00:00.000Z"),
    c("5", "t3", "bia", "2026-09-01T09:00:00.000Z"), // antigo (antes dos 7 dias)
    c("6", "t4", null, "2026-10-16T09:00:00.000Z"), // autor apagado
  ];

  it("primeira vez: só o que é do par e dos últimos 7 dias, agrupado por conversa", () => {
    const u = unreadThreads(list, "ana", initialSeen(now));
    expect(u.map((x) => [x.transactionId, x.count, x.latest.id])).toEqual([["t1", 2, "2"], ["t2", 1, "4"]]);
  });

  it("abrir uma conversa marca só ela; 'marcar tudo' zera", () => {
    const seen = markThreadSeen(initialSeen(now), "t1", "2026-10-16T10:30:00.000Z");
    const u = unreadThreads(list, "ana", seen);
    expect(u.map((x) => [x.transactionId, x.count])).toEqual([["t1", 1], ["t2", 1]]);
    expect(unreadThreads(list, "ana", markAllSeen(now))).toEqual([]);
  });

  it("o mapa de conversas vistas é podado pelo piso", () => {
    const s = pruneSeen({ floor: "2026-10-16T00:00:00.000Z", tx: { a: "2026-10-15T00:00:00.000Z", b: "2026-10-16T05:00:00.000Z" } });
    expect(Object.keys(s.tx)).toEqual(["b"]);
  });
});

describe("comentários: aviso ao par", () => {
  it("Ana comentou em iFood R$ 87,00", () => {
    const m = commentMessage({ byName: "Ana", description: "iFood", amountCents: 8700, body: "  pedimos\n duas vezes? ", txId: "t1" });
    expect(m.title).toBe("Ana comentou em iFood R$ 87,00");
    expect(m.body).toBe("pedimos duas vezes?");
    expect(m.data).toEqual({ type: "comment", route: "/", txId: "t1" });
    expect(commentMessage({ byName: "Ana", description: "X", amountCents: 1, body: "y".repeat(300), txId: "t" }).body.length).toBeLessThanOrEqual(140);
  });
});
