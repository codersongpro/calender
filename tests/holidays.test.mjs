import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublicDataServiceKey,
  getPublicDataServiceKeyState,
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

