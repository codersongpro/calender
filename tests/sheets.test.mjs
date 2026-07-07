import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { ensureDatabaseSheets, formatGoogleSheetsApiError, normalizePrivateKey } from "../src/lib/sheets.js";

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

test("ensureDatabaseSheets grows an existing sheet's column count before syncing headers", async (t) => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@example.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey;

  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    const href = String(url);
    if (href.includes("oauth2.googleapis.com/token")) {
      return { ok: true, json: async () => ({ access_token: "fake-token", expires_in: 3600 }) };
    }
    if (href.includes(":batchUpdate")) {
      calls.push({ batchUpdateBody: JSON.parse(options.body) });
      return { ok: true, json: async () => ({}) };
    }
    if (href.includes(":append")) {
      return { ok: true, json: async () => ({}) };
    }
    if (href.includes("/values/") && options?.method === "PUT") {
      return { ok: true, json: async () => ({}) };
    }
    if (href.includes("?fields=")) {
      return {
        ok: true,
        json: async () => ({
          spreadsheetId: "sheet_x",
          properties: { title: "Test" },
          sheets: [
            { properties: { sheetId: 1, title: "Events", gridProperties: { columnCount: 12, rowCount: 1000 } } },
            { properties: { sheetId: 2, title: "Categories", gridProperties: { columnCount: 8, rowCount: 1000 } } },
            { properties: { sheetId: 3, title: "Holidays", gridProperties: { columnCount: 10, rowCount: 1000 } } },
            { properties: { sheetId: 4, title: "Settings", gridProperties: { columnCount: 8, rowCount: 1000 } } },
            { properties: { sheetId: 5, title: "EditLog", gridProperties: { columnCount: 8, rowCount: 1000 } } },
          ],
        }),
      };
    }
    return { ok: true, json: async () => ({ values: [] }) };
  };

  t.after(() => {
    global.fetch = originalFetch;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  });

  await ensureDatabaseSheets("sheet_x");

  const batchUpdateCall = calls.find((call) => call.batchUpdateBody);
  assert.ok(batchUpdateCall, "expected a batchUpdate call to grow the grid");
  const growEvents = batchUpdateCall.batchUpdateBody.requests.find(
    (req) => req.updateSheetProperties?.properties?.sheetId === 1,
  );
  assert.ok(growEvents, "expected the Events sheet's column count to be grown");
  assert.equal(growEvents.updateSheetProperties.properties.gridProperties.columnCount, 14);

  const growOthers = batchUpdateCall.batchUpdateBody.requests.filter(
    (req) => req.updateSheetProperties && req.updateSheetProperties.properties.sheetId !== 1,
  );
  assert.equal(growOthers.length, 0, "sheets that already have enough columns should be left alone");
});
