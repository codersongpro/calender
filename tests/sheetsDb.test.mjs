import assert from "node:assert/strict";
import test from "node:test";

import { appendImportedEvents, clearEventsInRange, getMonthData, undoImportBatch } from "../src/lib/sheetsDb.js";

test("month loading reads each data sheet once without re-validating sheet schema", async () => {
  const calls = [];
  const data = await getMonthData(
    { orgName: "학성초등학교", spreadsheetId: "sheet_1" },
    { year: 2026, month: 7 },
    {
      cacheTtlMs: 0,
      getValues: async (_spreadsheetId, range) => {
        calls.push(range);
        if (range === "'Events'!A:N") {
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

  assert.deepEqual(calls, ["'Events'!A:N", "'Holidays'!A:J", "'Categories'!A:D"]);
  assert.equal(data.days[0].events[0].title, "월례회");
});

test("month loading reuses a short-lived sheet data cache for fast month changes", async () => {
  const calls = [];
  const deps = {
    now: () => 1000,
    cacheTtlMs: 30_000,
    getValues: async (_spreadsheetId, range) => {
      calls.push(range);
      if (range === "'Events'!A:N") return [["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"]];
      if (range === "'Holidays'!A:J") return [["id", "date", "endDate", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]];
      if (range === "'Categories'!A:D") return [["name", "color", "sortOrder", "active"]];
      throw new Error(`unexpected range ${range}`);
    },
  };

  await getMonthData({ orgName: "학성초등학교", spreadsheetId: "sheet_2" }, { year: 2026, month: 7 }, deps);
  await getMonthData({ orgName: "학성초등학교", spreadsheetId: "sheet_2" }, { year: 2026, month: 8 }, deps);

  assert.deepEqual(calls, ["'Events'!A:N", "'Holidays'!A:J", "'Categories'!A:D"]);
});

test("month loading preserves workbook imports saved before the endDate column existed", async () => {
  const data = await getMonthData(
    { orgName: "Uploaded School", spreadsheetId: "sheet_legacy_upload" },
    { year: 2026, month: 7 },
    {
      cacheTtlMs: 0,
      getValues: async (_spreadsheetId, range) => {
        if (range === "'Events'!A:N") {
          return [
            ["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"],
            ["evt_old", "2026-07-03", "행사", "09:00", "업로드 행사", "강당", "교무부", "1", "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z", ""],
          ];
        }
        if (range === "'Holidays'!A:J") {
          return [["id", "date", "endDate", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]];
        }
        if (range === "'Categories'!A:D") {
          return [["name", "color", "sortOrder", "active"]];
        }
        throw new Error(`unexpected range ${range}`);
      },
    },
  );

  assert.deepEqual(data.days[2].events[0], {
    id: "evt_old",
    date: "2026-07-03",
    endDate: "",
    category: "행사",
    time: "09:00",
    title: "업로드 행사",
    place: "강당",
    owner: "교무부",
    sortOrder: "1",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: "",
    reviewNeeded: "",
    importBatchId: "",
  });
});

test("month loading preserves legacy workbook rows with blank categories", async () => {
  const data = await getMonthData(
    { orgName: "Uploaded School", spreadsheetId: "sheet_legacy_blank_category" },
    { year: 2026, month: 7 },
    {
      cacheTtlMs: 0,
      getValues: async (_spreadsheetId, range) => {
        if (range === "'Events'!A:N") {
          return [
            ["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"],
            ["evt_old_blank", "2026-07-03", "", "15:00-16:30", "1학기 담당장학 및 과학실 안전 점검", "3학년 교실, 과학실", "김다래, 송동석", "1", "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z", ""],
          ];
        }
        if (range === "'Holidays'!A:J") {
          return [["id", "date", "endDate", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]];
        }
        if (range === "'Categories'!A:D") {
          return [["name", "color", "sortOrder", "active"]];
        }
        throw new Error(`unexpected range ${range}`);
      },
    },
  );

  assert.equal(data.days[2].events[0].category, "");
  assert.equal(data.days[2].events[0].time, "15:00-16:30");
  assert.equal(data.days[2].events[0].title, "1학기 담당장학 및 과학실 안전 점검");
  assert.equal(data.days[2].events[0].place, "3학년 교실, 과학실");
  assert.equal(data.days[2].events[0].owner, "김다래, 송동석");
});

test("workbook import appends parsed events tagged with a new batch id", async () => {
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
      makeId: (prefix) => `${prefix}_test`,
    },
  );

  assert.deepEqual(result, { count: 1, sheets: ["6월"], warnings: ["검토 필요"], batchId: "batch_test" });
  assert.deepEqual(calls, [
    ["ensure"],
    [
      "append",
      "sheet_3",
      "'Events'!A2:N",
      [["evt_1", "2026-06-01", "", "행사", "09:00", "시업식", "강당", "문유리", 1, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "", "", "batch_test"]],
    ],
    ["log", "import-workbook", "", "", { count: 1, sheets: ["6월"], warnings: ["검토 필요"], batchId: "batch_test" }],
    ["clear", "sheet_3"],
  ]);
});

test("undo import batch soft-deletes only events from that batch", async () => {
  const calls = [];
  const result = await undoImportBatch(
    { spreadsheetId: "sheet_undo" },
    "batch_test",
    {
      getValues: async (_spreadsheetId, range) => {
        assert.equal(range, "'Events'!A:N");
        return [
          ["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt", "reviewNeeded", "importBatchId"],
          ["evt_imported", "2026-06-01", "", "행사", "09:00", "시업식", "강당", "문유리", "1", "", "", "", "", "batch_test"],
          ["evt_manual", "2026-06-02", "", "행사", "10:00", "직접 입력한 행사", "강당", "문유리", "2", "", "", "", "", ""],
        ];
      },
      clearValues: async (spreadsheetId, range) => calls.push(["clear", spreadsheetId, range]),
      updateValues: async (spreadsheetId, range, rows) => calls.push(["update", spreadsheetId, range, rows]),
      logEdit: async (_config, action, eventId, before, after) => calls.push(["log", action, eventId, before, after]),
      clearInstitutionDataCache: (spreadsheetId) => calls.push(["cache", spreadsheetId]),
    },
  );

  assert.deepEqual(result, { count: 1 });
  const [, [, , , rows]] = calls;
  assert.equal(rows[1][0], "evt_imported");
  assert.notEqual(rows[1][11], "");
  assert.equal(rows[2][0], "evt_manual");
  assert.equal(rows[2][11], "");
  assert.deepEqual(calls[2], ["log", "undo-import", "", "", { batchId: "batch_test", count: 1 }]);
});

test("month clear removes only events in the selected month", async () => {
  const calls = [];
  const result = await clearEventsInRange(
    { spreadsheetId: "sheet_clear" },
    { scope: "month", schoolYear: 2026, month: 7 },
    {
      getValues: async (_spreadsheetId, range) => {
        assert.equal(range, "'Events'!A:N");
        return [
          ["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"],
          ["evt_july", "2026-07-03", "", "행사", "09:00", "지울 행사", "강당", "교무부", "1", "", "", ""],
          ["evt_august", "2026-08-01", "", "행사", "09:00", "남길 행사", "강당", "교무부", "2", "", "", ""],
        ];
      },
      clearValues: async (spreadsheetId, range) => calls.push(["clear", spreadsheetId, range]),
      updateValues: async (spreadsheetId, range, rows) => calls.push(["update", spreadsheetId, range, rows]),
      logEdit: async (_config, action, eventId, before, after) => calls.push(["log", action, eventId, before, after]),
      clearInstitutionDataCache: (spreadsheetId) => calls.push(["cache", spreadsheetId]),
    },
  );

  assert.deepEqual(result, { count: 1, start: "2026-07-01", end: "2026-07-31" });
  assert.deepEqual(calls, [
    ["clear", "sheet_clear", "'Events'!A:N"],
    [
      "update",
      "sheet_clear",
      "'Events'!A1:N2",
      [
        ["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt", "reviewNeeded", "importBatchId"],
        ["evt_august", "2026-08-01", "", "행사", "09:00", "남길 행사", "강당", "교무부", "2", "", "", "", "", ""],
      ],
    ],
    ["log", "clear-month", "", "", { start: "2026-07-01", end: "2026-07-31", count: 1 }],
    ["cache", "sheet_clear"],
  ]);
});
