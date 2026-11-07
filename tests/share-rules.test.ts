import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { coversCategory, expiryDate, isExpired, looksLikeToken } from "../src/lib/share-rules";

test("expiry", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  assert.equal(isExpired({ expires_at: null }, now), false);
  assert.equal(isExpired({ expires_at: "2026-11-07T11:59:59Z" }, now), true);
  assert.equal(isExpired({ expires_at: "2026-11-08T00:00:00Z" }, now), false);
  assert.equal(expiryDate("never", now), null);
  assert.equal(expiryDate("7", now), "2026-11-14T12:00:00.000Z");
  assert.equal(expiryDate("-3", now), null);
});

test("categories and tokens", () => {
  assert.ok(coversCategory({ categories: null }, "Figures"));
  assert.ok(coversCategory({ categories: [] }, "Figures"));
  assert.ok(coversCategory({ categories: ["Figures"] }, "Figures"));
  assert.ok(!coversCategory({ categories: ["Pokémon"] }, "Figures"));
  assert.ok(looksLikeToken(randomBytes(16).toString("base64url")));
  assert.ok(!looksLikeToken("short"));
  assert.ok(!looksLikeToken("../../etc/passwd-aaaaaaaaaaaa"));
});
