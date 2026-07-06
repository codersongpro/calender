import assert from "node:assert/strict";
import test from "node:test";

import { normalizePrivateKey } from "../src/lib/sheets.js";

const PEM_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";

test("service account private keys normalize escaped newlines and accidental wrapping quotes", () => {
  assert.equal(
    normalizePrivateKey(`"${PEM_KEY}"`),
    "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
  );
});

test("service account private keys reject private_key_id or malformed values", () => {
  assert.throws(
    () => normalizePrivateKey("abc123privatekeyid"),
    /private_key 값이 올바르지 않습니다/,
  );
});

