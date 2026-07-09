import assert from "node:assert/strict";
import test from "node:test";

import { appendImportedEvents, clearEventsInRange, getMonthData, restoreInstitutionData, undoImportBatch } from "../src/lib/sheetsDb.js";

function mockBatchGet(rangeData) {
  return async (_spreadsheetId, ranges) =>
    ranges.map((range) => {
      if (range in rangeData) return rangeData[range];
      throw new Error(`unexpected range ${range}`);
    });
}

test("month loading reads every data sheet in a single batched request", async () => {
  const calls = [];
  const baseBatchGet = mockBatchGet({
    "'Events'!A:P": [
      ["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"],
      ["evt_1", "2026-07-01", "", "행사", "", "월례회", "회의실", "교무", "1", "", "", ""],
    ],
    "'Holidays'!A:K": [["id", "date", "endDate", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]],
    "'Categories'!A:D": [
      ["name", "color", "sortOrder", "active"],
      ["행사", "#2563eb", "10", "TRUE"],
    ],
  });
  const data = await getMonthData(
    { orgName: "학성초등학교", spreadsheetId: "sheet_1" },
    { year: 2026, month: 7 },
    {
      cacheTtlMs: 0,
      batchGetValues: async (spreadsheetId, ranges) => {
        calls.push(ranges);
        return baseBatchGet(spreadsheetId, ranges);
      },
    },
  );

  assert.deepEqual(calls, [["'Events'!A:P", "'Holidays'!A:K", "'Categories'!A:D"]]);
  assert.equal(data.days[0].events[0].title, "월례회");
});

test("month loading reuses a short-lived sheet data cache for fast month changes", async () => {
  const calls = [];
  const baseBatchGet = mockBatchGet({
    "'Events'!A:P": [["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"]],
    "'Holidays'!A:K": [["id", "date", "endDate", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]],
    "'Categories'!A:D": [["name", "color", "sortOrder", "active"]],
  });
  const deps = {
    now: () => 1000,
    cacheTtlMs: 30_000,
    batchGetValues: async (spreadsheetId, ranges) => {
      calls.push(ranges);
      return baseBatchGet(spreadsheetId, ranges);
    },
  };

  await getMonthData({ orgName: "학성초등학교", spreadsheetId: "sheet_2" }, { year: 2026, month: 7 }, deps);
  await getMonthData({ orgName: "학성초등학교", spreadsheetId: "sheet_2" }, { year: 2026, month: 8 }, deps);

  assert.deepEqual(calls, [["'Events'!A:P", "'Holidays'!A:K", "'Categories'!A:D"]]);
});

test("month loading preserves workbook imports saved before the endDate column existed", async () => {
  const data = await getMonthData(
    { orgName: "Uploaded School", spreadsheetId: "sheet_legacy_upload" },
    { year: 2026, month: 7 },
    {
      cacheTtlMs: 0,
      batchGetValues: mockBatchGet({
        "'Events'!A:P": [
          ["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"],
          ["evt_old", "2026-07-03", "행사", "09:00", "업로드 행사", "강당", "교무부", "1", "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z", ""],
        ],
        "'Holidays'!A:K": [["id", "date", "endDate", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]],
        "'Categories'!A:D": [["name", "color", "sortOrder", "active"]],
      }),
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
    memo: "",
    includeWeekend: "",
  });
});

test("month loading preserves legacy workbook rows with blank categories", async () => {
  const data = await getMonthData(
    { orgName: "Uploaded School", spreadsheetId: "sheet_legacy_blank_category" },
    { year: 2026, month: 7 },
    {
      cacheTtlMs: 0,
      batchGetValues: mockBatchGet({
        "'Events'!A:P": [
          ["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt"],
          ["evt_old_blank", "2026-07-03", "", "15:00-16:30", "1학기 담당장학 및 과학실 안전 점검", "3학년 교실, 과학실", "김다래, 송동석", "1", "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z", ""],
        ],
        "'Holidays'!A:K": [["id", "date", "endDate", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]],
        "'Categories'!A:D": [["name", "color", "sortOrder", "active"]],
      }),
    },
  );

  assert.equal(data.days[2].events[0].category, "");
  assert.equal(data.days[2].events[0].time, "15:00-16:30");
  assert.equal(data.days[2].events[0].title, "1학기 담당장학 및 과학실 안전 점검");
  assert.equal(data.days[2].events[0].place, "3학년 교실, 과학실");
  assert.equal(data.days[2].events[0].owner, "김다래, 송동석");
});

test("month loading surfaces rows whose dates were coerced to Sheets serial numbers", async () => {
  const data = await getMonthData(
    { orgName: "Uploaded School", spreadsheetId: "sheet_serial_dates" },
    { year: 2026, month: 9 },
    {
      cacheTtlMs: 0,
      batchGetValues: mockBatchGet({
        "'Events'!A:P": [
          ["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt", "reviewNeeded", "importBatchId"],
          ["evt_serial", "46266", "", "", "", "9월~ 기초학력 진단 집중의 달", "", "", "1", "", "", "", "", "batch_1"],
        ],
        "'Holidays'!A:K": [["id", "date", "endDate", "name", "type", "source", "isHoliday", "enabled", "memo", "updatedAt"]],
        "'Categories'!A:D": [["name", "color", "sortOrder", "active"]],
      }),
    },
  );

  assert.equal(data.days[0].events[0].date, "2026-09-01");
  assert.equal(data.days[0].events[0].title, "9월~ 기초학력 진단 집중의 달");
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
      "'Events'!A2:P",
      [["evt_1", "2026-06-01", "", "행사", "09:00", "시업식", "강당", "문유리", 1, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "", "", "batch_test", "", ""]],
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
        assert.equal(range, "'Events'!A:P");
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
        assert.equal(range, "'Events'!A:P");
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
    ["clear", "sheet_clear", "'Events'!A:P"],
    [
      "update",
      "sheet_clear",
      "'Events'!A1:P2",
      [
        ["id", "date", "endDate", "category", "time", "title", "place", "owner", "sortOrder", "createdAt", "updatedAt", "deletedAt", "reviewNeeded", "importBatchId", "memo", "includeWeekend"],
        ["evt_august", "2026-08-01", "", "행사", "09:00", "남길 행사", "강당", "교무부", "2", "", "", "", "", "", "", ""],
      ],
    ],
    ["log", "clear-month", "", "", { start: "2026-07-01", end: "2026-07-31", count: 1 }],
    ["cache", "sheet_clear"],
  ]);
});

test("restore replaces every data sheet with backup contents and re-serializes booleans", async () => {
  const calls = [];
  const deps = {
    ensureInstitutionDatabase: async () => calls.push(["ensure"]),
    clearValues: async (_id, range) => calls.push(["clear", range]),
    updateValues: async (_id, range, rows) => calls.push(["update", range, rows]),
    logEdit: async (_config, action, _eventId, _before, after) => calls.push(["log", action, after]),
    clearInstitutionDataCache: (id) => calls.push(["cache", id]),
  };

  const result = await restoreInstitutionData(
    { spreadsheetId: "sheet_restore" },
    {
      exportedAt: "2026-07-09T12:00:00.000Z",
      events: [
        {
          id: "evt_1",
          date: "2026-07-01",
          endDate: "",
          category: "행사",
          time: "09:00",
          title: "복원된 행사",
          place: "강당",
          owner: "교무부",
          sortOrder: "1",
          createdAt: "",
          updatedAt: "",
          deletedAt: "",
          reviewNeeded: "",
          importBatchId: "",
          memo: "",
          includeWeekend: "",
        },
      ],
      // The backup's read path converts these to real booleans - restore
      // must write them back as the sheet's "TRUE"/"FALSE" strings.
      holidays: [
        {
          id: "hol_1",
          date: "2026-07-17",
          endDate: "",
          name: "제헌절",
          type: "공휴일",
          source: "auto",
          isHoliday: true,
          enabled: false,
          memo: "",
          updatedAt: "",
          includeWeekend: "",
        },
      ],
      categories: [{ name: "행사", color: "#2563eb", sortOrder: "20", active: true }],
    },
    deps,
  );

  assert.deepEqual(result, { events: 1, holidays: 1, categories: 1 });

  const updates = calls.filter(([kind]) => kind === "update");
  assert.deepEqual(
    updates.map(([, range]) => range),
    ["'Events'!A1:P2", "'Holidays'!A1:K2", "'Categories'!A1:D2"],
  );

  const holidayRow = updates[1][2][1];
  assert.equal(holidayRow[6], "TRUE");
  assert.equal(holidayRow[7], "FALSE");
  const categoryRow = updates[2][2][1];
  assert.equal(categoryRow[3], "TRUE");

  const clears = calls.filter(([kind]) => kind === "clear").map(([, range]) => range);
  assert.deepEqual(clears, ["'Events'!A:P", "'Holidays'!A:K", "'Categories'!A:D"]);
  assert.ok(calls.some(([kind, action]) => kind === "log" && action === "restore"));
  assert.ok(calls.some(([kind]) => kind === "cache"));
});

test("restore rejects files that are not a backup produced by the app", async () => {
  await assert.rejects(
    restoreInstitutionData({ spreadsheetId: "sheet_restore" }, { events: "oops" }, {}),
    /백업 파일 형식이 올바르지 않습니다/,
  );
  await assert.rejects(
    restoreInstitutionData({ spreadsheetId: "sheet_restore" }, { events: [{ title: "id 없음" }], holidays: [], categories: [] }, {}),
    /일정 항목이 손상되었습니다/,
  );
});
