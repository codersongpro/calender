import { createSign } from "node:crypto";

import {
  CATEGORY_HEADERS,
  DEFAULT_CATEGORIES,
  EDIT_LOG_HEADERS,
  EVENT_HEADERS,
  HOLIDAY_HEADERS,
  SETTINGS_HEADERS,
} from "./domain.js";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_CACHE = {
  token: "",
  expiresAt: 0,
};

export const DB_SHEETS = {
  Events: EVENT_HEADERS,
  Categories: CATEGORY_HEADERS,
  Holidays: HOLIDAY_HEADERS,
  Settings: SETTINGS_HEADERS,
  EditLog: EDIT_LOG_HEADERS,
};

export function extractSpreadsheetId(value) {
  const input = String(value ?? "").trim();
  if (!input) throw new Error("구글 스프레드시트 주소를 입력해 주세요.");
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(input)) return input;
  throw new Error("올바른 구글 스프레드시트 주소가 아닙니다.");
}

export function getServiceAccountEmail() {
  const credentials = getServiceAccountCredentials(false);
  return credentials?.client_email ?? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "";
}

export async function getSpreadsheetMetadata(spreadsheetId) {
  return sheetsRequest(`${API_BASE}/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`);
}

export async function ensureDatabaseSheets(spreadsheetId) {
  const metadata = await getSpreadsheetMetadata(spreadsheetId);
  const existingTitles = new Set(metadata.sheets?.map((sheet) => sheet.properties.title) ?? []);
  const requests = [];

  for (const title of Object.keys(DB_SHEETS)) {
    if (!existingTitles.has(title)) {
      requests.push({
        addSheet: {
          properties: {
            title,
            hidden: title !== "Settings",
            gridProperties: { rowCount: 1000, columnCount: Math.max(DB_SHEETS[title].length, 8) },
          },
        },
      });
    }
  }

  if (requests.length > 0) {
    await batchUpdateSpreadsheet(spreadsheetId, requests);
  }

  for (const [title, headers] of Object.entries(DB_SHEETS)) {
    const values = await getValues(spreadsheetId, `${quoteSheet(title)}!1:1`);
    const currentHeaders = values[0] ?? [];
    if (headers.some((header, index) => currentHeaders[index] !== header)) {
      await updateValues(spreadsheetId, `${quoteSheet(title)}!A1:${columnLetter(headers.length)}1`, [headers]);
    }
  }

  const categories = await getValues(spreadsheetId, "'Categories'!A2:D");
  if (categories.length === 0) {
    await appendValues(spreadsheetId, "'Categories'!A2:D", DEFAULT_CATEGORIES);
  }

  return { spreadsheetId, title: metadata.properties?.title ?? "" };
}

export async function getValues(spreadsheetId, range) {
  const response = await sheetsRequest(
    `${API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
  );
  return response.values ?? [];
}

export async function updateValues(spreadsheetId, range, values) {
  return sheetsRequest(`${API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}

export async function appendValues(spreadsheetId, range, values) {
  if (!values.length) return null;
  return sheetsRequest(
    `${API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    },
  );
}

export async function clearValues(spreadsheetId, range) {
  return sheetsRequest(`${API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function batchUpdateSpreadsheet(spreadsheetId, requests) {
  return sheetsRequest(`${API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

async function sheetsRequest(url, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(formatGoogleSheetsApiError(response.status, message));
  }
  return response.json();
}

export function formatGoogleSheetsApiError(status, body) {
  const parsed = parseGoogleApiError(body);
  const reason = parsed?.details?.find((detail) => detail?.["@type"] === "type.googleapis.com/google.rpc.ErrorInfo")?.reason;
  const metadata = parsed?.details?.find((detail) => detail?.["@type"] === "type.googleapis.com/google.rpc.ErrorInfo")?.metadata ?? {};

  if (status === 403 && reason === "SERVICE_DISABLED") {
    const project = metadata.consumer?.replace(/^projects\//, "") || metadata.containerInfo || "";
    const activationUrl = metadata.activationUrl || "https://console.cloud.google.com/apis/library/sheets.googleapis.com";
    return [
      `Google Sheets API가${project ? ` Google Cloud 프로젝트 ${project}에서` : ""} 비활성화되어 있습니다.`,
      `아래 주소에서 Google Sheets API를 사용 설정한 뒤 몇 분 기다렸다가 다시 점검해 주세요: ${activationUrl}`,
    ].join(" ");
  }

  return `Google Sheets API 오류: ${status} ${parsed?.message || String(body ?? "")}`;
}

async function getAccessToken() {
  if (TOKEN_CACHE.token && Date.now() < TOKEN_CACHE.expiresAt - 60000) return TOKEN_CACHE.token;

  const credentials = getServiceAccountCredentials(true);
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    {
      alg: "RS256",
      typ: "JWT",
    },
    {
      iss: credentials.client_email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    credentials.private_key,
  );

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`서비스 계정 인증 실패: ${response.status} ${message}`);
  }

  const data = await response.json();
  TOKEN_CACHE.token = data.access_token;
  TOKEN_CACHE.expiresAt = Date.now() + Number(data.expires_in ?? 3600) * 1000;
  return TOKEN_CACHE.token;
}

function signJwt(header, claim, privateKey) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedClaim = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const input = `${encodedHeader}.${encodedClaim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  try {
    return `${input}.${signer.sign(privateKey).toString("base64url")}`;
  } catch (error) {
    if (error?.code === "ERR_OSSL_UNSUPPORTED" || String(error?.message ?? "").includes("DECODER routines::unsupported")) {
      throw new Error(
        "Google 서비스 계정 private_key 형식을 읽지 못했습니다. JSON의 private_key 전체를 넣었는지, private_key_id를 넣지 않았는지, 줄바꿈(\\n)이 깨지지 않았는지 확인해 주세요.",
      );
    }
    throw error;
  }
}

function getServiceAccountCredentials(required) {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return {
      client_email: parsed.client_email,
      private_key: normalizePrivateKey(parsed.private_key),
    };
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    };
  }

  if (required) {
    throw new Error(
      "서비스 계정 환경변수 GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY가 필요합니다.",
    );
  }
  return null;
}

function parseGoogleApiError(body) {
  try {
    const parsed = JSON.parse(String(body ?? ""));
    return parsed?.error ?? null;
  } catch {
    return null;
  }
}

export function normalizePrivateKey(value) {
  let key = String(value ?? "").trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/\\n/g, "\n").trim();
  if (!key.includes("-----BEGIN PRIVATE KEY-----") || !key.includes("-----END PRIVATE KEY-----")) {
    throw new Error(
      "Google 서비스 계정 private_key 값이 올바르지 않습니다. JSON 파일의 private_key 전체를 넣어야 하며 private_key_id 값을 넣으면 안 됩니다.",
    );
  }
  return key;
}

export function quoteSheet(title) {
  return `'${String(title).replaceAll("'", "''")}'`;
}

export function columnLetter(index) {
  let current = index;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}
