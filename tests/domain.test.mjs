import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateHolidayClusters,
  getMonthOptions,
  getSchoolYearRange,
  parseLegacyRows,
} from "../src/lib/domain.js";
import { hashPassword, verifyPassword } from "../src/lib/security.js";
import { extractSpreadsheetId } from "../src/lib/sheets.js";

test("school year always runs from March 1 to the last day of next February", () => {
  assert.deepEqual(getSchoolYearRange(2026), {
    start: "2026-03-01",
    end: "2027-02-28",
  });
  assert.deepEqual(getSchoolYearRange(2027), {
    start: "2027-03-01",
    end: "2028-02-29",
  });
});

test("month options are ordered from March through next February", () => {
  assert.deepEqual(
    getMonthOptions(2026).map((item) => `${item.year}-${item.month}`),
    [
      "2026-3",
      "2026-4",
      "2026-5",
      "2026-6",
      "2026-7",
      "2026-8",
      "2026-9",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-1",
      "2027-2",
    ],
  );
});

test("holiday clusters include weekends connected to holidays", () => {
  const clusters = calculateHolidayClusters(
    [
      {
        id: "h1",
        date: "2026-10-09",
        name: "한글날",
        type: "공휴일",
        source: "auto",
        isHoliday: true,
        enabled: true,
      },
    ],
    "2026-10-01",
    "2026-10-31",
  );

  assert.deepEqual(clusters, [
    {
      start: "2026-10-09",
      end: "2026-10-11",
      days: 3,
      names: ["한글날"],
    },
  ]);
});

test("legacy monthly rows are normalized into individual events", () => {
  const rows = [
    ["일", "요일", "구분", "시 간", "일 정 제 목", "장 소", "담당자"],
    [
      "6",
      "금",
      "행사\n출장\n협의",
      "\n12:30~16:30\n12:40~13:00",
      "학급임원선거(2~6)\n신규영양교사 동행지원단\n2026. 1학기 학습준비물 선정 위원회",
      "교실\n충북 교육연구정보원 ICT실\n교무실",
      "함봉주\n김희진\n송동석",
    ],
  ];

  const result = parseLegacyRows(rows, { schoolYear: 2026, tabTitle: "3월" });

  assert.equal(result.events.length, 3);
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
        date: "2026-03-06",
        category: "행사",
        time: "",
        title: "학급임원선거(2~6)",
        place: "교실",
        owner: "함봉주",
      },
      {
        date: "2026-03-06",
        category: "출장",
        time: "12:30~16:30",
        title: "신규영양교사 동행지원단",
        place: "충북 교육연구정보원 ICT실",
        owner: "김희진",
      },
      {
        date: "2026-03-06",
        category: "협의",
        time: "12:40~13:00",
        title: "2026. 1학기 학습준비물 선정 위원회",
        place: "교무실",
        owner: "송동석",
      },
    ],
  );
});

test("password hashes verify the right secret and reject the wrong one", async () => {
  const hash = await hashPassword("school-secret");

  assert.equal(await verifyPassword("school-secret", hash), true);
  assert.equal(await verifyPassword("wrong-secret", hash), false);
});

test("spreadsheet id is extracted from urls and raw ids", () => {
  assert.equal(
    extractSpreadsheetId(
      "https://docs.google.com/spreadsheets/d/1uvYR2gcjBBVU-YOn7bVpREp7RXeU-D6L52tvCFsJ-2Y/edit#gid=0",
    ),
    "1uvYR2gcjBBVU-YOn7bVpREp7RXeU-D6L52tvCFsJ-2Y",
  );
  assert.equal(
    extractSpreadsheetId("1uvYR2gcjBBVU-YOn7bVpREp7RXeU-D6L52tvCFsJ-2Y"),
    "1uvYR2gcjBBVU-YOn7bVpREp7RXeU-D6L52tvCFsJ-2Y",
  );
});
