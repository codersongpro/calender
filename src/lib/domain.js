const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export const EVENT_HEADERS = [
  "id",
  "date",
  "category",
  "time",
  "title",
  "place",
  "owner",
  "sortOrder",
  "createdAt",
  "updatedAt",
  "deletedAt",
];

export const CATEGORY_HEADERS = ["name", "color", "sortOrder", "active"];

export const EVENT_CATEGORY_OPTIONS = ["출장", "행사", "협의", "심사", "연수", "(직접입력)"];

export const HOLIDAY_HEADERS = [
  "id",
  "date",
  "name",
  "type",
  "source",
  "isHoliday",
  "enabled",
  "memo",
  "updatedAt",
];

export const SETTINGS_HEADERS = ["key", "value", "updatedAt"];
export const EDIT_LOG_HEADERS = ["timestamp", "action", "eventId", "before", "after"];

export const DEFAULT_CATEGORIES = [
  ["출장", "#0f766e", 10, "TRUE"],
  ["행사", "#2563eb", 20, "TRUE"],
  ["협의", "#7c3aed", 30, "TRUE"],
  ["심사", "#be123c", 40, "TRUE"],
  ["연수", "#c2410c", 50, "TRUE"],
  ["교육", "#047857", 60, "TRUE"],
  ["회의", "#ca8a04", 70, "TRUE"],
  ["체험", "#6d28d9", 80, "TRUE"],
];

export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(dateKey, days) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function getSchoolYearRange(schoolYear) {
  const start = new Date(Number(schoolYear), 2, 1);
  const end = new Date(Number(schoolYear) + 1, 2, 0);
  return {
    start: toDateKey(start),
    end: toDateKey(end),
  };
}

export function getCurrentSchoolYear(now = new Date()) {
  const month = now.getMonth() + 1;
  return month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

export function getMonthOptions(schoolYear) {
  const baseYear = Number(schoolYear);
  return Array.from({ length: 12 }, (_, index) => {
    const monthIndex = index + 3;
    const month = monthIndex <= 12 ? monthIndex : monthIndex - 12;
    const year = monthIndex <= 12 ? baseYear : baseYear + 1;
    return {
      year,
      month,
      key: `${year}-${String(month).padStart(2, "0")}`,
      label: year === baseYear ? `${month}월` : `${year}.${month}월`,
    };
  });
}

export function getMonthBounds(year, month) {
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 0);
  return {
    start: toDateKey(start),
    end: toDateKey(end),
  };
}

export function getMonthDays(year, month) {
  const end = new Date(Number(year), Number(month), 0).getDate();
  return Array.from({ length: end }, (_, index) => {
    const day = index + 1;
    const date = new Date(Number(year), Number(month) - 1, day);
    return {
      date: toDateKey(date),
      day,
      weekday: DAY_NAMES[date.getDay()],
      isSaturday: date.getDay() === 6,
      isSunday: date.getDay() === 0,
    };
  });
}

export function isDateInRange(dateKey, start, end) {
  return dateKey >= start && dateKey <= end;
}

export function normalizeBoolean(value, defaultValue = false) {
  if (value === true || value === "TRUE" || value === "true" || value === "Y") return true;
  if (value === false || value === "FALSE" || value === "false" || value === "N") return false;
  return defaultValue;
}

export function calculateHolidayClusters(holidays, start, end) {
  const enabledHolidayDates = new Set(
    holidays
      .filter((holiday) => normalizeBoolean(holiday.enabled, true) && normalizeBoolean(holiday.isHoliday, true))
      .map((holiday) => holiday.date),
  );
  const dateNames = new Map();

  for (const holiday of holidays) {
    if (!normalizeBoolean(holiday.enabled, true) || !normalizeBoolean(holiday.isHoliday, true)) continue;
    if (!dateNames.has(holiday.date)) dateNames.set(holiday.date, []);
    dateNames.get(holiday.date).push(holiday.name);
  }

  const candidates = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const date = parseDateKey(day);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    if (weekend || enabledHolidayDates.has(day)) {
      candidates.push(day);
    }
  }

  const clusters = [];
  let current = null;

  for (const day of candidates) {
    if (!current) {
      current = [day];
      continue;
    }
    if (addDays(current[current.length - 1], 1) === day) {
      current.push(day);
    } else {
      pushHolidayCluster(clusters, current, dateNames);
      current = [day];
    }
  }
  if (current) pushHolidayCluster(clusters, current, dateNames);

  return clusters.filter((cluster) => cluster.days >= 3 && cluster.names.length > 0);
}

function pushHolidayCluster(clusters, days, dateNames) {
  const names = [...new Set(days.flatMap((day) => dateNames.get(day) ?? []))];
  clusters.push({
    start: days[0],
    end: days[days.length - 1],
    days: days.length,
    names,
  });
}

export function rowsToObjects(rows, headers) {
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()])),
    );
}

export function objectToRow(object, headers) {
  return headers.map((header) => object[header] ?? "");
}

export function buildMonthCsv(monthData) {
  const rows = [
    ["기관명", "학년도", "월"],
    [monthData.config?.orgName ?? "", monthData.year, monthData.month],
    [],
    ["날짜", "요일", "구분", "시간", "일정 제목", "장소", "담당자"],
  ];

  for (const day of monthData.days ?? []) {
    const events = day.events?.length ? day.events : [null];
    for (const event of events) {
      rows.push([
        day.date,
        day.weekday,
        event?.category ?? "",
        event?.time ?? "",
        event?.title ?? "",
        event?.place ?? "",
        event?.owner ?? "",
      ]);
    }
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function getPrintRowCount(monthData) {
  return (monthData.days ?? []).reduce((count, day) => count + Math.max(day.events?.length ?? 0, 1), 0);
}

export function getTimeOptions(stepMinutes = 10) {
  const step = Math.max(1, Number(stepMinutes) || 10);
  const options = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += step) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
    const minute = String(minutes % 60).padStart(2, "0");
    options.push(`${hour}:${minute}`);
  }
  return options;
}

export function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getYearMonthFromLegacyTab(tabTitle, schoolYear) {
  const normalized = String(tabTitle).trim();
  const simple = normalized.match(/^(\d{1,2})월$/);
  if (simple) {
    const month = Number(simple[1]);
    return {
      year: month >= 3 ? Number(schoolYear) : Number(schoolYear) + 1,
      month,
    };
  }

  const dotted = normalized.match(/(?:^|\D)(\d{2,4})\.(\d{1,2})월$/);
  if (dotted) {
    const rawYear = Number(dotted[1]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return { year, month: Number(dotted[2]) };
  }

  return null;
}

export function parseLegacyRows(rows, { schoolYear, tabTitle }) {
  const yearMonth = getYearMonthFromLegacyTab(tabTitle, schoolYear);
  if (!yearMonth) return { events: [], warnings: [`월 탭 이름을 해석할 수 없습니다: ${tabTitle}`] };

  const headerIndex = rows.findIndex((row) =>
    ["일", "요일", "구분"].every((header) => row.map((cell) => String(cell).trim()).includes(header)),
  );
  if (headerIndex < 0) return { events: [], warnings: [`헤더를 찾을 수 없습니다: ${tabTitle}`] };

  const events = [];
  const warnings = [];
  let currentDay = null;
  let currentSortOrder = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    const parsedDay = Number(String(row[0] ?? "").trim());
    const isNewDay = Boolean(parsedDay);
    if (isNewDay) {
      currentDay = parsedDay;
      currentSortOrder = 0;
    }
    const day = currentDay;
    if (!day) continue;

    const titles = splitLines(row[4]);
    if (titles.length === 0) continue;

    const categoryLines = splitLines(row[2]);
    const timeLines = splitLines(row[3], true);
    const placeLines = splitLines(row[5]);
    const ownerLines = splitLines(row[6]);
    const lineSources = [categoryLines, timeLines, placeLines, ownerLines];
    const reviewNeeded = lineSources.some((lines) => lines.length > 1 && lines.length !== titles.length);

    if (reviewNeeded) warnings.push(`${tabTitle} ${day}일 행의 줄 수가 맞지 않아 검토가 필요합니다.`);

    titles.forEach((title, index) => {
      const date = toDateKey(new Date(yearMonth.year, yearMonth.month - 1, day));
      events.push({
        id: makeId("evt"),
        date,
        category: pickLegacyLine(categoryLines, index),
        time: pickLegacyLine(timeLines, index),
        title,
        place: pickLegacyLine(placeLines, index),
        owner: pickLegacyLine(ownerLines, index),
        sortOrder: currentSortOrder + index + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: "",
        reviewNeeded,
      });
    });
    currentSortOrder += titles.length;
  }

  return { events, warnings };
}

function splitLines(value, keepBlankLeading = false) {
  const rawLines = String(value ?? "").split(/\r?\n/);
  const lines = keepBlankLeading ? rawLines.map((line) => line.trim()) : rawLines.map((line) => line.trim()).filter(Boolean);
  if (!keepBlankLeading) return lines;
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function pickLegacyLine(lines, index) {
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];
  return lines[index] ?? "";
}

export function buildMonthView({ year, month, events, holidays }) {
  const bounds = getMonthBounds(year, month);
  const days = getMonthDays(year, month);
  const holidayClusters = calculateHolidayClusters(holidays, bounds.start, bounds.end);

  return {
    year: Number(year),
    month: Number(month),
    days: days.map((day) => {
      const dayEvents = events
        .filter((event) => event.date === day.date && !event.deletedAt)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.time).localeCompare(String(b.time)));
      const dayHolidays = holidays.filter(
        (holiday) => holiday.date === day.date && normalizeBoolean(holiday.enabled, true),
      );
      const cluster = holidayClusters.find((item) => day.date >= item.start && day.date <= item.end);
      return {
        ...day,
        events: dayEvents,
        holidays: dayHolidays,
        holidayCluster: cluster ?? null,
      };
    }),
    holidayClusters,
  };
}
