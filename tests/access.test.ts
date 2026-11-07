import assert from "node:assert/strict";
import { test } from "node:test";
import { canAdmin, isOwner, normalizeEmail, ownerEmails } from "../src/lib/access";

test("owners come from ADMIN_EMAILS, falling back to ALLOWED_EMAILS", () => {
  const saved = { a: process.env.ADMIN_EMAILS, b: process.env.ALLOWED_EMAILS };
  delete process.env.ADMIN_EMAILS;
  process.env.ALLOWED_EMAILS = " Me@Example.com , other@x.io";
  assert.deepEqual(ownerEmails(), ["me@example.com", "other@x.io"]);
  assert.ok(isOwner("ME@example.com"));
  process.env.ADMIN_EMAILS = "boss@x.io";
  assert.ok(isOwner("boss@x.io"));
  assert.ok(!isOwner("me@example.com"));
  assert.ok(!isOwner(null));
  process.env.ADMIN_EMAILS = saved.a;
  process.env.ALLOWED_EMAILS = saved.b;
  if (saved.a === undefined) delete process.env.ADMIN_EMAILS;
  if (saved.b === undefined) delete process.env.ALLOWED_EMAILS;
});

test("emails and roles", () => {
  assert.equal(normalizeEmail("  Sam.Rivera@Gmail.com "), "sam.rivera@gmail.com");
  assert.equal(normalizeEmail("not an email"), null);
  assert.equal(normalizeEmail(""), null);
  assert.ok(canAdmin("owner") && canAdmin("admin"));
  assert.ok(!canAdmin("member") && !canAdmin(null));
});
