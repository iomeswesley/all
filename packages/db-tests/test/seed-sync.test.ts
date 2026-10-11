import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeedSql } from "../../../scripts/gen-seed-sql.mjs";

describe("seed de estabelecimentos", () => {
  it("migration commitada está sincronizada com packages/core/src/seeds/merchants.ts", () => {
    const file = path.resolve(import.meta.dirname, "../../../supabase/migrations/20261011000005_seed_merchants.sql");
    expect(fs.readFileSync(file, "utf8")).toBe(buildSeedSql());
  });
});
