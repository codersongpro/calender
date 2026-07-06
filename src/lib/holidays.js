import { makeId } from "./domain.js";
import { replaceAutoHolidays } from "./sheetsDb.js";

const ENDPOINT = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo";

export async function refreshSchoolYearHolidays(config, schoolYear) {
  const serviceKey = getPublicDataServiceKey(config);
  if (!serviceKey) {
    throw new Error("공공데이터포털 서비스키가 필요합니다. 학교 관리에서 서비스키를 저장하거나 PUBLIC_DATA_SERVICE_KEY 환경변수를 설정해 주세요.");
  }

  const requests = [];
  for (let month = 3; month <= 12; month += 1) requests.push(fetchHolidayMonth(serviceKey, schoolYear, month));
  for (let month = 1; month <= 2; month += 1) requests.push(fetchHolidayMonth(serviceKey, Number(schoolYear) + 1, month));

  const holidays = (await Promise.all(requests))
    .flat()
    .map((item) => ({
      id: `auto_${item.locdate}_${safeId(item.dateName)}`,
      date: `${String(item.locdate).slice(0, 4)}-${String(item.locdate).slice(4, 6)}-${String(item.locdate).slice(6, 8)}`,
      name: item.dateName,
      type: inferHolidayType(item.dateName),
      source: "auto",
      isHoliday: item.isHoliday === "Y" ? "TRUE" : "FALSE",
      enabled: "TRUE",
      memo: "",
      updatedAt: new Date().toISOString(),
    }))
    .filter((holiday) => holiday.isHoliday === "TRUE");

  return replaceAutoHolidays(config, holidays);
}

export function getPublicDataServiceKey(config = {}) {
  return String(config.publicDataServiceKey || process.env.PUBLIC_DATA_SERVICE_KEY || "").trim();
}

export function getPublicDataServiceKeyState(config = {}) {
  const schoolConfigured = Boolean(String(config.publicDataServiceKey ?? "").trim());
  const environmentConfigured = Boolean(String(process.env.PUBLIC_DATA_SERVICE_KEY ?? "").trim());
  return {
    publicDataServiceKeyConfigured: schoolConfigured || environmentConfigured,
    publicDataServiceKeyStored: schoolConfigured,
    publicDataServiceKeyFromEnv: !schoolConfigured && environmentConfigured,
    publicDataServiceKeySource: schoolConfigured ? "school" : environmentConfigured ? "environment" : "missing",
  };
}

async function fetchHolidayMonth(serviceKey, year, month) {
  const params = new URLSearchParams({
    ServiceKey: serviceKey,
    pageNo: "1",
    numOfRows: "50",
    solYear: String(year),
    solMonth: String(month).padStart(2, "0"),
  });

  const response = await fetch(`${ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`공휴일 API 호출 실패: ${response.status} ${message}`);
  }
  return parseHolidayXml(await response.text());
}

function parseHolidayXml(xml) {
  const items = [];
  const matches = String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const match of matches) {
    items.push({
      dateName: tagValue(match[1], "dateName"),
      isHoliday: tagValue(match[1], "isHoliday"),
      locdate: tagValue(match[1], "locdate"),
    });
  }
  return items.filter((item) => item.locdate && item.dateName);
}

function tagValue(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXml(match[1].trim()) : "";
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function inferHolidayType(name) {
  if (/설날|추석/.test(name)) return "명절";
  return "공휴일";
}

function safeId(value) {
  return String(value ?? "")
    .replace(/[^\w가-힣-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || makeId("holiday");
}
