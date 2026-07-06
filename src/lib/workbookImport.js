import { getYearMonthFromLegacyTab, parseLegacyRows } from "./domain.js";

export const MAX_WORKBOOK_IMPORT_BYTES = 10 * 1024 * 1024;

export function parseWorkbookSheets(sheets, { schoolYear }) {
  const imported = [];
  const warnings = [];
  const importableSheets = [];

  for (const sheet of sheets ?? []) {
    const title = String(sheet?.title ?? "").trim();
    if (!getYearMonthFromLegacyTab(title, schoolYear)) continue;

    importableSheets.push(title);
    const result = parseLegacyRows(sheet.rows ?? [], { schoolYear, tabTitle: title });
    warnings.push(...result.warnings);
    imported.push(...result.events);
  }

  if (importableSheets.length === 0) {
    warnings.push("업로드한 엑셀에서 '3월', '4월' 같은 월별 시트를 찾을 수 없습니다.");
  }

  return { events: imported, sheets: importableSheets, warnings };
}

export async function parseUploadedWorkbook(file, { schoolYear }) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("업로드할 엑셀 파일을 선택해 주세요.");
  }

  if (file.size && file.size > MAX_WORKBOOK_IMPORT_BYTES) {
    throw new Error("엑셀 파일은 10MB 이하로 업로드해 주세요.");
  }

  const filename = String(file.name ?? "");
  if (filename && !/\.(xlsx|xlsm)$/i.test(filename)) {
    throw new Error("월별 행사계획 엑셀 파일(.xlsx, .xlsm)을 업로드해 주세요.");
  }

  const { default: readXlsxFile } = await import("read-excel-file/node");
  const workbookSheets = await readXlsxFile(Buffer.from(await file.arrayBuffer()));

  const sheets = workbookSheets.map((sheet) => ({
    title: sheet.sheet,
    rows: sheet.data.map((row) => row.map(cellToText)),
  }));

  return parseWorkbookSheets(sheets, { schoolYear });
}

function cellToText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}
