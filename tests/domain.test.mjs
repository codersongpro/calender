import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthCsv,
  buildMonthView,
  calculateHolidayClusters,
  EVENT_CATEGORY_OPTIONS,
  getDayPrintWeight,
  getHolidayLineNames,
  getPrintContentHeightMm,
  getPrintRowClass,
  getPrintRowCount,
  getPrintWeightForDays,
  getMonthOptions,
  getRowCountForDays,
  getSchoolYearRange,
  normalizeSheetDate,
  parseLegacyRows,
  PRINT_MARGIN_MM,
  splitDaysForPrint,
} from "../src/lib/domain.js";
import { hashPassword, verifyPassword } from "../src/lib/security.js";
import { extractSpreadsheetId } from "../src/lib/sheets.js";

test("normalizeSheetDate converts Google Sheets serial dates back to ISO keys", () => {
  assert.equal(normalizeSheetDate(46266), "2026-09-01");
  assert.equal(normalizeSheetDate("46204"), "2026-07-01");
  assert.equal(normalizeSheetDate("46237"), "2026-08-03");
});

test("normalizeSheetDate leaves ISO date strings and blanks untouched", () => {
  assert.equal(normalizeSheetDate("2026-09-23"), "2026-09-23");
  assert.equal(normalizeSheetDate("2026-7-3"), "2026-07-03");
  assert.equal(normalizeSheetDate(""), "");
  assert.equal(normalizeSheetDate(null), "");
});

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
      includesWeekend: true,
    },
  ]);
});

test("a holiday entered with includeWeekend: false doesn't absorb its adjacent weekend", () => {
  const holidays = [
    {
      id: "h1",
      date: "2026-10-09",
      name: "한글날",
      isHoliday: true,
      enabled: true,
      includeWeekend: false,
    },
  ];

  // A lone Friday holiday can't reach the 3-day cluster minimum on its own
  // once it's marked as not bridging into the weekend next to it.
  assert.deepEqual(calculateHolidayClusters(holidays, "2026-10-01", "2026-10-31"), []);
});

test("each holiday's includeWeekend flag is independent of other holidays in the same month", () => {
  // Two unrelated Friday holidays two weeks apart: one wants its weekend
  // folded into the cluster, the other explicitly doesn't.
  const holidays = [
    { id: "h1", date: "2026-10-09", name: "한글날", isHoliday: true, enabled: true, includeWeekend: true },
    { id: "h2", date: "2026-10-23", name: "재량휴업일", isHoliday: true, enabled: true, includeWeekend: false },
  ];

  const clusters = calculateHolidayClusters(holidays, "2026-10-01", "2026-10-31");
  assert.deepEqual(clusters, [
    {
      start: "2026-10-09",
      end: "2026-10-11",
      days: 3,
      names: ["한글날"],
      includesWeekend: true,
    },
  ]);
});

test("a holiday cluster with no adjacent weekend is marked as weekday-only", () => {
  const clusters = calculateHolidayClusters(
    [
      {
        id: "h1",
        date: "2026-09-15",
        endDate: "2026-09-17",
        name: "임시휴업일",
        isHoliday: true,
        enabled: true,
      },
    ],
    "2026-09-01",
    "2026-09-30",
  );

  assert.deepEqual(clusters, [
    {
      start: "2026-09-15",
      end: "2026-09-17",
      days: 3,
      names: ["임시휴업일"],
      includesWeekend: false,
    },
  ]);
});

test("month view expands event and holiday date ranges", () => {
  const view = buildMonthView({
    year: 2026,
    month: 7,
    events: [
      {
        id: "evt_1",
        date: "2026-07-20",
        endDate: "2026-07-22",
        category: "event",
        time: "",
        title: "Summer program",
        place: "",
        owner: "",
        sortOrder: "1",
      },
    ],
    holidays: [
      {
        id: "hol_1",
        date: "2026-07-27",
        endDate: "2026-07-31",
        name: "Summer break",
        isHoliday: true,
        enabled: true,
      },
    ],
  });

  assert.deepEqual(
    view.days.filter((day) => day.events.length).map((day) => day.date),
    ["2026-07-20", "2026-07-21", "2026-07-22"],
  );
  assert.deepEqual(
    view.days.filter((day) => day.holidays.length).map((day) => day.date),
    ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
  );
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

test("legacy monthly continuation rows keep the previous day", () => {
  const rows = [
    ["일", "요일", "구분", "시 간", "일 정 제 목", "장 소", "담당자"],
    ["1", "월", "컨설팅", "14:30~16:30", "진천 초등 기초학력 컨설팅", "미정", "김다래"],
    ["", "", "컨설팅", "10:00~11:00", "방과후.돌봄(늘봄학교) 운영 컨설팅", "도서관", "김민정"],
  ];

  const result = parseLegacyRows(rows, { schoolYear: 2026, tabTitle: "6월" });

  assert.equal(result.events.length, 2);
  assert.deepEqual(
    result.events.map((event) => ({
      date: event.date,
      category: event.category,
      time: event.time,
      title: event.title,
      place: event.place,
      owner: event.owner,
      sortOrder: event.sortOrder,
    })),
    [
      {
        date: "2026-06-01",
        category: "컨설팅",
        time: "14:30~16:30",
        title: "진천 초등 기초학력 컨설팅",
        place: "미정",
        owner: "김다래",
        sortOrder: 1,
      },
      {
        date: "2026-06-01",
        category: "컨설팅",
        time: "10:00~11:00",
        title: "방과후.돌봄(늘봄학교) 운영 컨설팅",
        place: "도서관",
        owner: "김민정",
        sortOrder: 2,
      },
    ],
  );
});

test("legacy monthly rows preserve blank alignment lines inside multi-line cells", () => {
  const rows = [
    ["일", "요일", "구분", "시 간", "일 정 제 목", "장 소", "담당자"],
    [
      "7",
      "화",
      "교육",
      "",
      "K-스마트교육(5학년)\n나무공예체험(2학년)\n나무공예체험(1학년)\n자기성장프로그램 사기충전 3기(사제동행) 인솔 및 지도",
      "컴퓨터실\n각 교실\n\n청풍마음쉼터",
      "이정훈\n나상연\n\n학교장",
    ],
  ];

  const result = parseLegacyRows(rows, { schoolYear: 2026, tabTitle: "7월" });

  assert.deepEqual(
    result.events.map((event) => ({
      title: event.title,
      place: event.place,
      owner: event.owner,
    })),
    [
      { title: "K-스마트교육(5학년)", place: "컴퓨터실", owner: "이정훈" },
      { title: "나무공예체험(2학년)", place: "각 교실", owner: "나상연" },
      { title: "나무공예체험(1학년)", place: "", owner: "" },
      {
        title: "자기성장프로그램 사기충전 3기(사제동행) 인솔 및 지도",
        place: "청풍마음쉼터",
        owner: "학교장",
      },
    ],
  );
});

test("legacy monthly rows preserve blank category lines", () => {
  const rows = [
    ["일", "요일", "구분", "시 간", "일 정 제 목", "장 소", "담당자"],
    [
      "17",
      "금",
      "교육\n\n출장",
      "9:00~10:25\n10:30~11:55\n9:30~",
      "꿈의 책버스 유치원 및 1학년 교육\n꿈의 책버스 2학년 교육\n2026. 학교관리자 성희롱,성폭력,성매매 예방 교육 연수",
      "꿈의 책버스\n(본교 수돗가근처)\n충북교육청",
      "이경숙\n\n문유리",
    ],
  ];

  const result = parseLegacyRows(rows, { schoolYear: 2026, tabTitle: "4월" });

  assert.deepEqual(
    result.events.map((event) => ({
      category: event.category,
      owner: event.owner,
    })),
    [
      { category: "교육", owner: "이경숙" },
      { category: "", owner: "" },
      { category: "출장", owner: "문유리" },
    ],
  );
});

test("legacy monthly rows infer event end dates from date ranges in titles", () => {
  const rows = [
    ["일", "요일", "구분", "시 간", "일 정 제 목", "장 소", "담당자"],
    ["24", "금", "", "", "7.24~8.23(여름방학)\n여름방학 영어캠프(7.24~7.28)", "도서실\n각 학년교실", "배나미\n김다래"],
    ["22", "월", "교육", "", "여름 Green Week(6.22.~7.3.)\n6.22~23(환경지속가능발전교육)", "", ""],
    ["30", "월", "행사", "", "학급임원선거(2~6)\n학교문화책임규약 선서(3/30~4/3)", "", ""],
  ];

  const july = parseLegacyRows([rows[0], rows[1]], { schoolYear: 2026, tabTitle: "7월" });
  const june = parseLegacyRows([rows[0], rows[2]], { schoolYear: 2026, tabTitle: "6월" });
  const march = parseLegacyRows([rows[0], rows[3]], { schoolYear: 2026, tabTitle: "3월" });

  assert.deepEqual(
    july.events.map((event) => ({ title: event.title, endDate: event.endDate })),
    [
      { title: "7.24~8.23(여름방학)", endDate: "2026-08-23" },
      { title: "여름방학 영어캠프(7.24~7.28)", endDate: "2026-07-28" },
    ],
  );
  assert.deepEqual(
    june.events.map((event) => ({ title: event.title, endDate: event.endDate })),
    [
      { title: "여름 Green Week(6.22.~7.3.)", endDate: "2026-07-03" },
      { title: "6.22~23(환경지속가능발전교육)", endDate: "2026-06-23" },
    ],
  );
  assert.deepEqual(
    march.events.map((event) => ({ title: event.title, endDate: event.endDate })),
    [
      { title: "학급임원선거(2~6)", endDate: "" },
      { title: "학교문화책임규약 선서(3/30~4/3)", endDate: "2026-04-03" },
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

test("event category options include the fixed choices and direct input marker", () => {
  assert.deepEqual(EVENT_CATEGORY_OPTIONS, ["출장", "행사", "협의", "심사", "연수", "교육", "(직접입력)"]);
});

test("month data can be exported as CSV including blank days and event rows", () => {
  const csv = buildMonthCsv({
    config: { orgName: "학성초등학교" },
    year: 2026,
    month: 7,
    days: [
      {
        date: "2026-07-01",
        day: 1,
        weekday: "수",
        events: [
          { category: "행사", time: "09:00", title: "개학식", place: "강당", owner: "교무" },
        ],
      },
      {
        date: "2026-07-02",
        day: 2,
        weekday: "목",
        events: [],
      },
    ],
  });

  assert.equal(
    csv,
    [
      "기관명,학년도,월",
      "학성초등학교,2026,7",
      "",
      "날짜,요일,구분,시간,일정 제목,장소,담당자",
      "2026-07-01,수,행사,09:00,개학식,강당,교무",
      "2026-07-02,목,,,,,",
    ].join("\r\n"),
  );
});

test("print row count follows expanded event rows and blank days", () => {
  assert.equal(
    getPrintRowCount({
      days: [
        { events: [] },
        { events: [{ id: "evt_1" }, { id: "evt_2" }] },
        { events: [{ id: "evt_3" }] },
      ],
    }),
    4,
  );
});

test("splitDaysForPrint returns everything on one page by default", () => {
  const days = [{ events: [] }, { events: [{ id: "evt_1" }] }, { events: [] }];
  assert.deepEqual(splitDaysForPrint(days, 1), [days]);
  assert.deepEqual(splitDaysForPrint(days), [days]);
});

test("splitDaysForPrint balances row counts across pages without splitting a day", () => {
  const days = Array.from({ length: 10 }, (_, index) => ({
    day: index + 1,
    // Front-loaded: days 1-3 have 5 events each, the rest have 1.
    events: Array.from({ length: index < 3 ? 5 : 1 }, (__, eventIndex) => ({ id: `evt_${index}_${eventIndex}` })),
  }));
  const totalRows = getRowCountForDays(days);

  const pages = splitDaysForPrint(days, 2);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.flat(), days);

  const rowCounts = pages.map((pageDays) => getRowCountForDays(pageDays));
  assert.equal(rowCounts[0] + rowCounts[1], totalRows);
  // Balanced split should land closer to half of the total than an even
  // day-count split (5 and 5 days) would, since the first 3 days are heavy.
  assert.ok(Math.abs(rowCounts[0] - rowCounts[1]) < totalRows / 2);
});

test("splitDaysForPrint keeps at least one day per page even with more pages than days", () => {
  const days = [{ events: [] }, { events: [] }];
  const pages = splitDaysForPrint(days, 5);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.flat(), days);
});

test("getPrintContentHeightMm subtracts print margins from each paper's height", () => {
  assert.equal(getPrintContentHeightMm("A4"), 297 - PRINT_MARGIN_MM * 2);
  assert.equal(getPrintContentHeightMm("A3"), 420 - PRINT_MARGIN_MM * 2);
  assert.equal(getPrintContentHeightMm("B4"), 364 - PRINT_MARGIN_MM * 2);
  assert.ok(getPrintContentHeightMm("A3") > getPrintContentHeightMm("A4"));
});

test("getPrintContentHeightMm falls back to A4 for an unknown paper key", () => {
  assert.equal(getPrintContentHeightMm("NOT_A_PAPER"), getPrintContentHeightMm("A4"));
  assert.equal(getPrintContentHeightMm(undefined), getPrintContentHeightMm("A4"));
});

test("getHolidayLineNames lists holiday and cluster names for a weekday-only cluster", () => {
  const day = {
    holidays: [{ name: "삼일절" }, { name: "" }],
    holidayCluster: { days: 3, includesWeekend: false },
  };
  assert.deepEqual(getHolidayLineNames(day), ["삼일절", "3일 연휴"]);
});

test("getHolidayLineNames suppresses the 'N일 연휴' label when the cluster includes a weekend", () => {
  const day = {
    holidays: [{ name: "제헌절" }],
    holidayCluster: { days: 3, includesWeekend: true },
  };
  // The holiday's own name still shows - only the auto-generated run label
  // is dropped, since the weekend shading already implies a long weekend.
  assert.deepEqual(getHolidayLineNames(day), ["제헌절"]);
});

test("getHolidayLineNames drops a holiday name already shown as the day's event title", () => {
  const day = { holidays: [{ name: "삼일절" }] };
  assert.deepEqual(getHolidayLineNames(day, "삼일절"), []);
  assert.deepEqual(getHolidayLineNames(day, "다른 제목"), ["삼일절"]);
});

test("getHolidayLineNames returns an empty list for a day with no holidays", () => {
  assert.deepEqual(getHolidayLineNames({}), []);
});

test("getPrintRowClass picks blank/normal/holiday based on content and duplicate titles", () => {
  const plainDay = { holidays: [] };
  assert.equal(getPrintRowClass(plainDay, null, 0), "print-row-blank");
  assert.equal(getPrintRowClass(plainDay, { title: "행사" }, 0), "print-row-normal");
  // A second event on the same day is never the "first row", so it can't
  // trigger the holiday-stacking class even if the day has a holiday.
  assert.equal(getPrintRowClass(plainDay, { title: "행사" }, 1), "print-row-normal");

  const holidayDay = { holidays: [{ name: "삼일절" }] };
  assert.equal(getPrintRowClass(holidayDay, null, 0), "print-row-normal");
  assert.equal(getPrintRowClass(holidayDay, { title: "삼일절" }, 0), "print-row-normal");
  assert.equal(getPrintRowClass(holidayDay, { title: "다른 행사" }, 0), "print-row-holiday");
});

test("getDayPrintWeight sums per-row weight for a day, favoring blank days and penalizing holiday stacking", () => {
  assert.equal(getDayPrintWeight({ events: [], holidays: [] }), 0.5);
  assert.equal(getDayPrintWeight({ events: [], holidays: [{ name: "삼일절" }] }), 1);
  assert.equal(getDayPrintWeight({ events: [{ title: "행사" }], holidays: [] }), 1);
  assert.equal(
    getDayPrintWeight({ events: [{ title: "행사" }], holidays: [{ name: "삼일절" }] }),
    2,
  );
  assert.equal(
    getDayPrintWeight({ events: [{ title: "행사1" }, { title: "행사2" }], holidays: [] }),
    2,
  );
});

test("getPrintWeightForDays sums getDayPrintWeight across a month", () => {
  const days = [
    { events: [], holidays: [] },
    { events: [{ title: "행사" }], holidays: [] },
  ];
  assert.equal(getPrintWeightForDays(days), 0.5 + 1);
});

