import assert from "node:assert/strict";
import test from "node:test";

import { formatGoogleSheetsApiError, normalizePrivateKey } from "../src/lib/sheets.js";

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

test("Google Sheets service-disabled errors point to the activation URL", () => {
  const message = formatGoogleSheetsApiError(
    403,
    JSON.stringify({
      error: {
        message: "Google Sheets API has not been used before or it is disabled.",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "SERVICE_DISABLED",
            metadata: {
              consumer: "projects/439476162840",
              activationUrl: "https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=439476162840",
            },
          },
        ],
      },
    }),
  );

  assert.match(message, /프로젝트 439476162840/);
  assert.match(message, /Google Sheets API를 사용 설정/);
  assert.match(message, /sheets\.googleapis\.com/);
});
