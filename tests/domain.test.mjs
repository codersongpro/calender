import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthCsv,
  buildMonthView,
  calculateHolidayClusters,
  EVENT_CATEGORY_OPTIONS,
  getPrintRowCount,
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
  assert.deepEqual(EVENT_CATEGORY_OPTIONS, ["출장", "행사", "협의", "심사", "연수", "(직접입력)"]);
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

