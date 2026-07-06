import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPublicDataApiError,
  getPublicDataServiceKey,
  getPublicDataServiceKeyState,
  normalizePublicDataServiceKey,
} from "../src/lib/holidays.js";

test("public data service key prefers school settings over the environment default", () => {
  const previous = process.env.PUBLIC_DATA_SERVICE_KEY;
  process.env.PUBLIC_DATA_SERVICE_KEY = "env-key";

  try {
    assert.equal(getPublicDataServiceKey({ publicDataServiceKey: "school-key" }), "school-key");
    assert.equal(getPublicDataServiceKey({ publicDataServiceKey: "" }), "env-key");
    assert.deepEqual(getPublicDataServiceKeyState({ publicDataServiceKey: "" }), {
      publicDataServiceKeyConfigured: true,
      publicDataServiceKeyStored: false,
      publicDataServiceKeyFromEnv: true,
      publicDataServiceKeySource: "environment",
    });
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_DATA_SERVICE_KEY;
    else process.env.PUBLIC_DATA_SERVICE_KEY = previous;
  }
});

test("public data service keys normalize encoded portal keys before URLSearchParams encodes them", () => {
  assert.equal(normalizePublicDataServiceKey("abc%2Bdef%2Fghi%3D"), "abc+def/ghi=");
  assert.equal(getPublicDataServiceKey({ publicDataServiceKey: '"abc%2Bdef"' }), "abc+def");
});

test("public data API 403 errors explain the likely portal service-key causes", () => {
  const message = formatPublicDataApiError(403, "Forbidden");

  assert.match(message, /서비스키를 거부/);
  assert.match(message, /한국천문연구원 특일 정보 API/);
  assert.match(message, /Encoding 인증키/);
});
