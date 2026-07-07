import {
  buildMonthView,
  CATEGORY_HEADERS,
  EDIT_LOG_HEADERS,
  EVENT_HEADERS,
  getMonthBounds,
  getMonthOptions,
  getSchoolYearRange,
  getYearMonthFromLegacyTab,
  HOLIDAY_HEADERS,
  isItemInRange,
  makeId,
  normalizeSheetDate,
  objectToRow,
  parseLegacyRows,
  rowsToObjects,
  SETTINGS_HEADERS,
} from "./domain.js";
import {
  appendValues,
  clearValues,
  columnLetter,
  ensureDatabaseSheets,
  getSpreadsheetMetadata,
  getValues,
  quoteSheet,
  updateValues,
} from "./sheets.js";

const DATA_CACHE_TTL_MS = 30_000;
const dataCache = new Map();
const LEGACY_EVENT_HEADERS = EVENT_HEADERS.filter((header) => header !== "endDate" && header !== "reviewNeeded" && header !== "importBatchId");
const LEGACY_HOLIDAY_HEADERS = HOLIDAY_HEADERS.filter((header) => header !== "endDate");
const EVENTS_LAST_COLUMN = columnLetter(EVENT_HEADERS.length);
const EVENTS_RANGE_ALL = `'Events'!A:${EVENTS_LAST_COLUMN}`;

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
  const rows = await getValues(config.spreadsheetId, EVENTS_RANGE_ALL);
  return eventsFromRows(rows);
}

export async function listCategories(config) {
  await ensureInstitutionDatabase(config);
  const rows = await getValues(config.spreadsheetId, "'Categories'!A:D");
  return categoriesFromRows(rows);
}

export async function listHolidays(config) {
  await ensureInstitutionDatabase(config);
  const rows = await getValues(config.spreadsheetId, "'Holidays'!A:J");
  return holidaysFromRows(rows);
}

export async function getMonthData(config, { year, month }, options = {}) {
  const { events, holidays, categories } = await getInstitutionData(config, options);
  const bounds = getMonthBounds(year, month);
  const monthEvents = events.filter((event) => isItemInRange(event, bounds.start, bounds.end));
  const monthHolidays = holidays.filter((holiday) => isItemInRange(holiday, bounds.start, bounds.end));
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
    endDate: String(input.endDate ?? ""),
    category: String(input.category ?? ""),
    time: String(input.time ?? ""),
    title: String(input.title ?? ""),
    place: String(input.place ?? ""),
    owner: String(input.owner ?? ""),
    sortOrder: String(input.sortOrder ?? Date.now()),
    createdAt: now,
    updatedAt: now,
    deletedAt: "",
    reviewNeeded: "",
    importBatchId: "",
  };
  await appendValues(config.spreadsheetId, `'Events'!A2:${EVENTS_LAST_COLUMN}`, [objectToRow(event, EVENT_HEADERS)]);
  await logEdit(config, "create", event.id, "", event);
  clearInstitutionDataCache(config.spreadsheetId);
  return event;
}

export async function updateEvent(config, id, input) {
  const rows = await getValues(config.spreadsheetId, EVENTS_RANGE_ALL);
  const { object, rowNumber } = findRowById(rows, EVENT_HEADERS, id, LEGACY_EVENT_HEADERS, isLegacyEventRow);
  const updated = {
    ...object,
    ...Object.fromEntries(["date", "endDate", "category", "time", "title", "place", "owner", "sortOrder"].map((key) => [key, input[key] ?? object[key] ?? ""])),
    updatedAt: new Date().toISOString(),
  };
  await updateValues(config.spreadsheetId, `'Events'!A${rowNumber}:${EVENTS_LAST_COLUMN}${rowNumber}`, [objectToRow(updated, EVENT_HEADERS)]);
  await logEdit(config, "update", id, object, updated);
  clearInstitutionDataCache(config.spreadsheetId);
  return updated;
}

export async function deleteEvent(config, id) {
  const rows = await getValues(config.spreadsheetId, EVENTS_RANGE_ALL);
  const { object, rowNumber } = findRowById(rows, EVENT_HEADERS, id, LEGACY_EVENT_HEADERS, isLegacyEventRow);
  const deleted = { ...object, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await updateValues(config.spreadsheetId, `'Events'!A${rowNumber}:${EVENTS_LAST_COLUMN}${rowNumber}`, [objectToRow(deleted, EVENT_HEADERS)]);
  await logEdit(config, "delete", id, object, deleted);
  clearInstitutionDataCache(config.spreadsheetId);
  return deleted;
}

export async function clearEventsInRange(config, input, deps = {}) {
  const readValues = deps.getValues ?? getValues;
  const clearRows = deps.clearValues ?? clearValues;
  const writeRows = deps.updateValues ?? updateValues;
  const writeLog = deps.logEdit ?? logEdit;
  const clearCache = deps.clearInstitutionDataCache ?? clearInstitutionDataCache;
  const bounds = getClearBounds(input);
  const rows = await readValues(config.spreadsheetId, EVENTS_RANGE_ALL);
  const events = eventsFromRows(rows);
  const remaining = events.filter((event) => !event.date || !isItemInRange(event, bounds.start, bounds.end));
  const removedCount = events.length - remaining.length;
  const nextRows = [EVENT_HEADERS, ...remaining.map((event) => objectToRow(event, EVENT_HEADERS))];

  await clearRows(config.spreadsheetId, EVENTS_RANGE_ALL);
  await writeRows(config.spreadsheetId, `'Events'!A1:${EVENTS_LAST_COLUMN}${nextRows.length}`, nextRows);
  await writeLog(config, input.scope === "year" ? "clear-year" : "clear-month", "", "", { ...bounds, count: removedCount });
  clearCache(config.spreadsheetId);
  return { count: removedCount, ...bounds };
}

export async function saveHoliday(config, input) {
  const rows = await getValues(config.spreadsheetId, "'Holidays'!A:J");
  const now = new Date().toISOString();
  const holiday = {
    id: input.id || makeId("hol"),
    date: String(input.date ?? ""),
    endDate: String(input.endDate ?? ""),
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
    await updateValues(config.spreadsheetId, `'Holidays'!A${rowNumber}:J${rowNumber}`, [
      objectToRow(holiday, HOLIDAY_HEADERS),
    ]);
  } else {
    await appendValues(config.spreadsheetId, "'Holidays'!A2:J", [objectToRow(holiday, HOLIDAY_HEADERS)]);
  }
  await logEdit(config, "holiday", holiday.id, "", holiday);
  clearInstitutionDataCache(config.spreadsheetId);
  return holiday;
}

export async function replaceAutoHolidays(config, holidays) {
  const existingRows = await getValues(config.spreadsheetId, "'Holidays'!A:J");
  const existing = holidaysFromRows(existingRows);
  const adminRows = existing.filter((holiday) => holiday.source === "admin");
  const nextRows = [
    HOLIDAY_HEADERS,
    ...adminRows.map((holiday) => objectToRow(holiday, HOLIDAY_HEADERS)),
    ...holidays.map((holiday) => objectToRow(holiday, HOLIDAY_HEADERS)),
  ];
  await clearValues(config.spreadsheetId, "'Holidays'!A:J");
  await updateValues(config.spreadsheetId, `'Holidays'!A1:J${nextRows.length}`, nextRows);
  await logEdit(config, "refresh-holidays", "", "", { count: holidays.length });
  clearInstitutionDataCache(config.spreadsheetId);
  return holidays;
}

export async function appendImportedEvents(config, imported, meta = {}, deps = {}) {
  const ensureDb = deps.ensureInstitutionDatabase ?? ensureInstitutionDatabase;
  const appendRows = deps.appendValues ?? appendValues;
  const writeLog = deps.logEdit ?? logEdit;
  const clearCache = deps.clearInstitutionDataCache ?? clearInstitutionDataCache;
  const makeBatchId = deps.makeId ?? makeId;
  const warnings = meta.warnings ?? [];
  const sheets = meta.sheets ?? [];
  const action = meta.action ?? "import-workbook";
  const batchId = meta.batchId || (imported?.length ? makeBatchId("batch") : "");
  const events = (imported ?? []).map((event) => ({ ...event, importBatchId: batchId }));

  await ensureDb(config);
  if (events.length > 0) {
    await appendRows(
      config.spreadsheetId,
      `'Events'!A2:${EVENTS_LAST_COLUMN}`,
      events.map((event) => objectToRow(event, EVENT_HEADERS)),
    );
  }
  await writeLog(config, action, "", "", { count: events.length, sheets, warnings, batchId });
  clearCache(config.spreadsheetId);
  return { count: events.length, sheets, warnings, batchId };
}

export async function undoImportBatch(config, batchId, deps = {}) {
  const readValues = deps.getValues ?? getValues;
  const clearRows = deps.clearValues ?? clearValues;
  const writeRows = deps.updateValues ?? updateValues;
  const writeLog = deps.logEdit ?? logEdit;
  const clearCache = deps.clearInstitutionDataCache ?? clearInstitutionDataCache;

  if (!String(batchId ?? "").trim()) throw new Error("취소할 가져오기를 찾을 수 없습니다.");

  const rows = await readValues(config.spreadsheetId, EVENTS_RANGE_ALL);
  const events = eventsFromRows(rows);
  const now = new Date().toISOString();
  let removedCount = 0;
  const updated = events.map((event) => {
    if (event.importBatchId !== batchId || event.deletedAt) return event;
    removedCount += 1;
    return { ...event, deletedAt: now, updatedAt: now };
  });

  if (removedCount === 0) throw new Error("이미 취소되었거나 해당 가져오기 내역을 찾을 수 없습니다.");

  const nextRows = [EVENT_HEADERS, ...updated.map((event) => objectToRow(event, EVENT_HEADERS))];
  await clearRows(config.spreadsheetId, EVENTS_RANGE_ALL);
  await writeRows(config.spreadsheetId, `'Events'!A1:${EVENTS_LAST_COLUMN}${nextRows.length}`, nextRows);
  await writeLog(config, "undo-import", "", "", { batchId, count: removedCount });
  clearCache(config.spreadsheetId);
  return { count: removedCount };
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

  return appendImportedEvents(config, imported, {
    action: "import-legacy",
    sheets: importableSheets,
    warnings,
  });
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
    readValues(spreadsheetId, EVENTS_RANGE_ALL),
    readValues(spreadsheetId, "'Holidays'!A:J"),
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
  return rowsToObjectsWithLegacyRows(rows, EVENT_HEADERS, LEGACY_EVENT_HEADERS, isLegacyEventRow).map((event) => ({
    ...event,
    date: normalizeSheetDate(event.date),
    endDate: normalizeSheetDate(event.endDate),
  }));
}

function categoriesFromRows(rows) {
  return rowsToObjects(rows, CATEGORY_HEADERS).map((category) => ({
    ...category,
    active: category.active !== "FALSE",
  }));
}

function holidaysFromRows(rows) {
  return rowsToObjectsWithLegacyRows(rows, HOLIDAY_HEADERS, LEGACY_HOLIDAY_HEADERS, isLegacyHolidayRow).map((holiday) => ({
    ...holiday,
    date: normalizeSheetDate(holiday.date),
    endDate: normalizeSheetDate(holiday.endDate),
    isHoliday: holiday.isHoliday !== "FALSE",
    enabled: holiday.enabled !== "FALSE",
  }));
}

function rowsToObjectsWithLegacyRows(rows, headers, legacyHeaders, isLegacyRow) {
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => rowToObject(row, headers, isLegacyRow(row) ? legacyHeaders : headers));
}

function rowToObject(row, headers, sourceHeaders = headers) {
  const values = Object.fromEntries(sourceHeaders.map((header, index) => [header, String(row[index] ?? "").trim()]));
  return Object.fromEntries(headers.map((header) => [header, values[header] ?? ""]));
}

function isLegacyEventRow(row) {
  return row.length === LEGACY_EVENT_HEADERS.length && (isFilledNonDate(row[2]) || looksLikeTime(row[3]));
}

function isLegacyHolidayRow(row) {
  return row.length === LEGACY_HOLIDAY_HEADERS.length && isFilledNonDate(row[2]);
}

function isFilledNonDate(value) {
  const text = String(value ?? "").trim();
  return text !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(text);
}

function looksLikeTime(value) {
  return /^\d{1,2}:\d{2}/.test(String(value ?? "").trim());
}

function getClearBounds(input) {
  const schoolYear = Number(input?.schoolYear);
  if (!Number.isInteger(schoolYear)) throw new Error("학년도를 입력해 주세요.");
  if (input?.scope === "year") return getSchoolYearRange(schoolYear);

  const month = Number(input?.month);
  const option = getMonthOptions(schoolYear).find((item) => item.month === month);
  if (!option) throw new Error("월을 선택해 주세요.");
  return getMonthBounds(option.year, option.month);
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

function findRowById(rows, headers, id, legacyHeaders = headers, isLegacyRow = () => false) {
  const rowIndex = rows.slice(1).findIndex((row) => row[0] === id);
  if (rowIndex < 0) throw new Error("행사를 찾을 수 없습니다.");
  const row = rows[rowIndex + 1];
  return {
    rowNumber: rowIndex + 2,
    object: rowToObject(row, headers, isLegacyRow(row) ? legacyHeaders : headers),
  };
}
