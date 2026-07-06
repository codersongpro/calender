import {
  buildMonthView,
  CATEGORY_HEADERS,
  EDIT_LOG_HEADERS,
  EVENT_HEADERS,
  getMonthBounds,
  getYearMonthFromLegacyTab,
  HOLIDAY_HEADERS,
  makeId,
  objectToRow,
  parseLegacyRows,
  rowsToObjects,
  SETTINGS_HEADERS,
} from "./domain.js";
import {
  appendValues,
  clearValues,
  ensureDatabaseSheets,
  getSpreadsheetMetadata,
  getValues,
  quoteSheet,
  updateValues,
} from "./sheets.js";

const DATA_CACHE_TTL_MS = 30_000;
const dataCache = new Map();

export async function ensureInstitutionDatabase(config) {
  return ensureDatabaseSheets(config.spreadsheetId);
}

export async function syncSettingsSheet(config) {
  await ensureInstitutionDatabase(config);
  const rows = [
    SETTINGS_HEADERS,
    ["orgName", config.orgName, new Date().toISOString()],
    ["spreadsheetId", config.spreadsheetId, new Date().toISOString()],
    ["serviceAccountConfigured", config.spreadsheetId ? "TRUE" : "FALSE", new Date().toISOString()],
  ];
  await clearValues(config.spreadsheetId, "'Settings'!A:C");
  await updateValues(config.spreadsheetId, "'Settings'!A1:C4", rows);
}

export async function listEvents(config) {
  await ensureInstitutionDatabase(config);
  const rows = await getValues(config.spreadsheetId, "'Events'!A:K");
  return eventsFromRows(rows);
}

export async function listCategories(config) {
  await ensureInstitutionDatabase(config);
  const rows = await getValues(config.spreadsheetId, "'Categories'!A:D");
  return categoriesFromRows(rows);
}

export async function listHolidays(config) {
  await ensureInstitutionDatabase(config);
  const rows = await getValues(config.spreadsheetId, "'Holidays'!A:I");
  return holidaysFromRows(rows);
}

export async function getMonthData(config, { year, month }, options = {}) {
  const { events, holidays, categories } = await getInstitutionData(config, options);
  const bounds = getMonthBounds(year, month);
  const monthEvents = events.filter((event) => event.date >= bounds.start && event.date <= bounds.end);
  const monthHolidays = holidays.filter((holiday) => holiday.date >= bounds.start && holiday.date <= bounds.end);
  return {
    config: {
      orgName: config.orgName,
      spreadsheetId: config.spreadsheetId,
    },
    categories,
    ...buildMonthView({ year, month, events: monthEvents, holidays: monthHolidays }),
  };
}

export async function createEvent(config, input) {
  const now = new Date().toISOString();
  const event = {
    id: makeId("evt"),
    date: String(input.date ?? ""),
    category: String(input.category ?? ""),
    time: String(input.time ?? ""),
    title: String(input.title ?? ""),
    place: String(input.place ?? ""),
    owner: String(input.owner ?? ""),
    sortOrder: String(input.sortOrder ?? Date.now()),
    createdAt: now,
    updatedAt: now,
    deletedAt: "",
  };
  await appendValues(config.spreadsheetId, "'Events'!A2:K", [objectToRow(event, EVENT_HEADERS)]);
  await logEdit(config, "create", event.id, "", event);
  clearInstitutionDataCache(config.spreadsheetId);
  return event;
}

export async function updateEvent(config, id, input) {
  const rows = await getValues(config.spreadsheetId, "'Events'!A:K");
  const { object, rowNumber } = findRowById(rows, EVENT_HEADERS, id);
  const updated = {
    ...object,
    ...Object.fromEntries(["date", "category", "time", "title", "place", "owner", "sortOrder"].map((key) => [key, input[key] ?? object[key] ?? ""])),
    updatedAt: new Date().toISOString(),
  };
  await updateValues(config.spreadsheetId, `'Events'!A${rowNumber}:K${rowNumber}`, [objectToRow(updated, EVENT_HEADERS)]);
  await logEdit(config, "update", id, object, updated);
  clearInstitutionDataCache(config.spreadsheetId);
  return updated;
}

export async function deleteEvent(config, id) {
  const rows = await getValues(config.spreadsheetId, "'Events'!A:K");
  const { object, rowNumber } = findRowById(rows, EVENT_HEADERS, id);
  const deleted = { ...object, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await updateValues(config.spreadsheetId, `'Events'!A${rowNumber}:K${rowNumber}`, [objectToRow(deleted, EVENT_HEADERS)]);
  await logEdit(config, "delete", id, object, deleted);
  clearInstitutionDataCache(config.spreadsheetId);
  return deleted;
}

export async function saveHoliday(config, input) {
  const rows = await getValues(config.spreadsheetId, "'Holidays'!A:I");
  const now = new Date().toISOString();
  const holiday = {
    id: input.id || makeId("hol"),
    date: String(input.date ?? ""),
    name: String(input.name ?? ""),
    type: String(input.type ?? "기관휴일"),
    source: String(input.source ?? "admin"),
    isHoliday: input.isHoliday === false ? "FALSE" : "TRUE",
    enabled: input.enabled === false ? "FALSE" : "TRUE",
    memo: String(input.memo ?? ""),
    updatedAt: now,
  };

  const existing = rows.slice(1).findIndex((row) => row[0] === holiday.id);
  if (existing >= 0) {
    const rowNumber = existing + 2;
    await updateValues(config.spreadsheetId, `'Holidays'!A${rowNumber}:I${rowNumber}`, [
      objectToRow(holiday, HOLIDAY_HEADERS),
    ]);
  } else {
    await appendValues(config.spreadsheetId, "'Holidays'!A2:I", [objectToRow(holiday, HOLIDAY_HEADERS)]);
  }
  await logEdit(config, "holiday", holiday.id, "", holiday);
  clearInstitutionDataCache(config.spreadsheetId);
  return holiday;
}

export async function replaceAutoHolidays(config, holidays) {
  const existingRows = await getValues(config.spreadsheetId, "'Holidays'!A:I");
  const existing = rowsToObjects(existingRows, HOLIDAY_HEADERS);
  const adminRows = existing.filter((holiday) => holiday.source === "admin");
  const nextRows = [
    HOLIDAY_HEADERS,
    ...adminRows.map((holiday) => objectToRow(holiday, HOLIDAY_HEADERS)),
    ...holidays.map((holiday) => objectToRow(holiday, HOLIDAY_HEADERS)),
  ];
  await clearValues(config.spreadsheetId, "'Holidays'!A:I");
  await updateValues(config.spreadsheetId, `'Holidays'!A1:I${nextRows.length}`, nextRows);
  await logEdit(config, "refresh-holidays", "", "", { count: holidays.length });
  clearInstitutionDataCache(config.spreadsheetId);
  return holidays;
}

export async function importLegacyMonthlyTabs(config, schoolYear) {
  await ensureInstitutionDatabase(config);
  const metadata = await getSpreadsheetMetadata(config.spreadsheetId);
  const importableSheets = (metadata.sheets ?? [])
    .map((sheet) => sheet.properties.title)
    .filter((title) => getYearMonthFromLegacyTab(title, schoolYear));

  const imported = [];
  const warnings = [];
  for (const title of importableSheets) {
    const rows = await getValues(config.spreadsheetId, `${quoteSheet(title)}!A1:G1000`);
    const result = parseLegacyRows(rows, { schoolYear, tabTitle: title });
    warnings.push(...result.warnings);
    imported.push(...result.events);
  }

  if (imported.length > 0) {
    await appendValues(
      config.spreadsheetId,
      "'Events'!A2:K",
      imported.map((event) => objectToRow(event, EVENT_HEADERS)),
    );
  }
  await logEdit(config, "import-legacy", "", "", { count: imported.length, warnings });
  clearInstitutionDataCache(config.spreadsheetId);
  return { count: imported.length, sheets: importableSheets, warnings };
}

export function clearInstitutionDataCache(spreadsheetId) {
  dataCache.delete(String(spreadsheetId ?? ""));
}

async function getInstitutionData(config, options = {}) {
  const spreadsheetId = config.spreadsheetId;
  const now = options.now?.() ?? Date.now();
  const cacheTtlMs = options.cacheTtlMs ?? DATA_CACHE_TTL_MS;
  const cached = dataCache.get(spreadsheetId);
  if (cacheTtlMs > 0 && cached && now - cached.createdAt < cacheTtlMs) return cached.data;

  const readValues = options.getValues ?? getValues;
  const [eventRows, holidayRows, categoryRows] = await Promise.all([
    readValues(spreadsheetId, "'Events'!A:K"),
    readValues(spreadsheetId, "'Holidays'!A:I"),
    readValues(spreadsheetId, "'Categories'!A:D"),
  ]);

  const data = {
    events: eventsFromRows(eventRows),
    holidays: holidaysFromRows(holidayRows),
    categories: categoriesFromRows(categoryRows),
  };
  if (cacheTtlMs > 0) dataCache.set(spreadsheetId, { createdAt: now, data });
  return data;
}

function eventsFromRows(rows) {
  return rowsToObjects(rows, EVENT_HEADERS);
}

function categoriesFromRows(rows) {
  return rowsToObjects(rows, CATEGORY_HEADERS).map((category) => ({
    ...category,
    active: category.active !== "FALSE",
  }));
}

function holidaysFromRows(rows) {
  return rowsToObjects(rows, HOLIDAY_HEADERS).map((holiday) => ({
    ...holiday,
    isHoliday: holiday.isHoliday !== "FALSE",
    enabled: holiday.enabled !== "FALSE",
  }));
}

async function logEdit(config, action, eventId, before, after) {
  await appendValues(config.spreadsheetId, "'EditLog'!A2:E", [
    objectToRow(
      {
        timestamp: new Date().toISOString(),
        action,
        eventId,
        before: before ? JSON.stringify(before) : "",
        after: after ? JSON.stringify(after) : "",
      },
      EDIT_LOG_HEADERS,
    ),
  ]);
}

function findRowById(rows, headers, id) {
  const rowIndex = rows.slice(1).findIndex((row) => row[0] === id);
  if (rowIndex < 0) throw new Error("행사를 찾을 수 없습니다.");
  const row = rows[rowIndex + 1];
  return {
    rowNumber: rowIndex + 2,
    object: Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()])),
  };
}
