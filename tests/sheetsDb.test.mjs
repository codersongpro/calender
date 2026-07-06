import assert from "node:assert/strict";
import test from "node:test";

import { getMonthData } from "../src/lib/sheetsDb.js";

test("month loading reads each data sheet once without re-validating sheet schema", async () => {
  const calls = [];
  const data = await getMonthData(
    { orgName: "학성초등학교", spreadsheetId: "sheet_1" },
    { year: 2026, month: 7 },
    {
      cacheTtlMs: 0,
      getValues: async (_spreadsheetId, range) => {
        calls.push(range);
        if (range === "'Events'!A:K") {
          return [
            ["id", "date", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"],
            ["evt_1", "2026-07-01", "행사", "", "월례회", "회의실", "교무", "1", "", "", ""],
          ];
        }
        if (range === "'Holidays'!A:I") {
          return [["id", "date", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]];
        }
        if (range === "'Categories'!A:D") {
          return [
            ["name", "color", "sortOrder", "active"],
            ["행사", "#2563eb", "10", "TRUE"],
          ];
        }
        throw new Error(`unexpected range ${range}`);
      },
    },
  );

  assert.deepEqual(calls, ["'Events'!A:K", "'Holidays'!A:I", "'Categories'!A:D"]);
  assert.equal(data.days[0].events[0].title, "월례회");
});

test("month loading reuses a short-lived sheet data cache for fast month changes", async () => {
  const calls = [];
  const deps = {
    now: () => 1000,
    cacheTtlMs: 30_000,
    getValues: async (_spreadsheetId, range) => {
      calls.push(range);
      if (range === "'Events'!A:K") return [["id", "date", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"]];
      if (range === "'Holidays'!A:I") return [["id", "date", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]];
      if (range === "'Categories'!A:D") return [["name", "color", "sortOrder", "active"]];
      throw new Error(`unexpected range ${range}`);
    },
  };

  await getMonthData({ orgName: "학성초등학교", spreadsheetId: "sheet_2" }, { year: 2026, month: 7 }, deps);
  await getMonthData({ orgName: "학성초등학교", spreadsheetId: "sheet_2" }, { year: 2026, month: 8 }, deps);

  assert.deepEqual(calls, ["'Events'!A:K", "'Holidays'!A:I", "'Categories'!A:D"]);
});
