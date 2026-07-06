import assert from "node:assert/strict";
import test from "node:test";

import { parseWorkbookSheets } from "../src/lib/workbookImport.js";

test("uploaded workbook sheets parse month tabs and skip other tabs", () => {
  const result = parseWorkbookSheets(
    [
      {
        title: "표지",
        rows: [["월별 행사 계획"]],
      },
      {
        title: "6월",
        rows: [
          ["", "", "", "", "", "", ""],
          ["[6월중 행사 계획]", "", "", "", "", "", ""],
          ["", "", "", "", "", "", ""],
          ["일", "요일", "구분", "시 간", "일 정 제 목", "장 소", "담당자"],
          ["1", "월", "행사", "09:00", "시업식", "강당", "문유리"],
          ["", "", "출장", "10:00", "교육청 협의", "교육청", "김민정"],
        ],
      },
    ],
    { schoolYear: 2026 },
  );

  assert.deepEqual(result.sheets, ["6월"]);
  assert.equal(result.events.length, 2);
  assert.deepEqual(
    result.events.map((event) => ({
      date: event.date,
      category: event.category,
      time: event.time,
      title: event.title,
      place: event.place,
      owner: event.owner,
    })),
    [
      {
        date: "2026-06-01",
        category: "행사",
        time: "09:00",
        title: "시업식",
        place: "강당",
        owner: "문유리",
      },
      {
        date: "2026-06-01",
        category: "출장",
        time: "10:00",
        title: "교육청 협의",
        place: "교육청",
        owner: "김민정",
      },
    ],
  );
});
