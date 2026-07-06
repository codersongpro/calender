import assert from "node:assert/strict";
import test from "node:test";

import { appendImportedEvents, getMonthData } from "../src/lib/sheetsDb.js";

test("month loading reads each data sheet once without re-validating sheet schema", async () => {
  const calls = [];
  const data = await getMonthData(
    { orgName: "학성초등학교", spreadsheetId: "sheet_1" },
    { year: 2026, month: 7 },
    {
      cacheTtlMs: 0,
      getValues: async (_spreadsheetId, range) => {
        calls.push(range);
        if (range === "'Events'!A:L") {
          return [
            ["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"],
            ["evt_1", "2026-07-01", "", "행사", "", "월례회", "회의실", "교무", "1", "", "", ""],
          ];
        }
        if (range === "'Holidays'!A:J") {
          return [["id", "date", "endDate", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]];
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

  assert.deepEqual(calls, ["'Events'!A:L", "'Holidays'!A:J", "'Categories'!A:D"]);
  assert.equal(data.days[0].events[0].title, "월례회");
});

test("month loading reuses a short-lived sheet data cache for fast month changes", async () => {
  const calls = [];
  const deps = {
    now: () => 1000,
    cacheTtlMs: 30_000,
    getValues: async (_spreadsheetId, range) => {
      calls.push(range);
      if (range === "'Events'!A:L") return [["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"]];
      if (range === "'Holidays'!A:J") return [["id", "date", "endDate", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]];
      if (range === "'Categories'!A:D") return [["name", "color", "sortOrder", "active"]];
      throw new Error(`unexpected range ${range}`);
    },
  };

  await getMonthData({ orgName: "학성초등학교", spreadsheetId: "sheet_2" }, { year: 2026, month: 7 }, deps);
  await getMonthData({ orgName: "학성초등학교", spreadsheetId: "sheet_2" }, { year: 2026, month: 8 }, deps);

  assert.deepEqual(calls, ["'Events'!A:L", "'Holidays'!A:J", "'Categories'!A:D"]);
});

test("workbook import appends parsed events to the Events sheet", async () => {
  const calls = [];
  const event = {
    id: "evt_1",
    date: "2026-06-01",
    category: "행사",
    time: "09:00",
    title: "시업식",
    place: "강당",
    owner: "문유리",
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: "",
  };

  const result = await appendImportedEvents(
    { spreadsheetId: "sheet_3" },
    [event],
    { action: "import-workbook", sheets: ["6월"], warnings: ["검토 필요"] },
    {
      ensureInstitutionDatabase: async () => calls.push(["ensure"]),
      appendValues: async (spreadsheetId, range, rows) => calls.push(["append", spreadsheetId, range, rows]),
      logEdit: async (_config, action, eventId, before, after) => calls.push(["log", action, eventId, before, after]),
      clearInstitutionDataCache: (spreadsheetId) => calls.push(["clear", spreadsheetId]),
    },
  );

  assert.deepEqual(result, { count: 1, sheets: ["6월"], warnings: ["검토 필요"] });
  assert.deepEqual(calls, [
    ["ensure"],
    [
      "append",
      "sheet_3",
      "'Events'!A2:L",
      [["evt_1", "2026-06-01", "", "행사", "09:00", "시업식", "강당", "문유리", 1, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", ""]],
    ],
    ["log", "import-workbook", "", "", { count: 1, sheets: ["6월"], warnings: ["검토 필요"] }],
    ["clear", "sheet_3"],
  ]);
});
