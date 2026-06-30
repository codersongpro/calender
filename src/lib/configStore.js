import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { hashPassword } from "./security.js";
import { extractSpreadsheetId, getServiceAccountEmail } from "./sheets.js";

const CONFIG_PATH = path.join(process.cwd(), ".data", "app-config.json");

export async function getAppConfig() {
  const stored = await readStoredConfig();
  return {
    orgName: stored.orgName || process.env.ORG_NAME || "",
    spreadsheetId: stored.spreadsheetId || process.env.SPREADSHEET_ID || "",
    editPasswordHash: stored.editPasswordHash || process.env.EDIT_PASSWORD_HASH || "",
    adminPasswordHash: stored.adminPasswordHash || process.env.ADMIN_PASSWORD_HASH || "",
    publicDataServiceKey: stored.publicDataServiceKey || process.env.PUBLIC_DATA_SERVICE_KEY || "",
    appSecret: stored.appSecret || process.env.APP_SECRET || "",
    updatedAt: stored.updatedAt || "",
  };
}

export async function getPublicConfig() {
  const config = await getAppConfig();
  return {
    setupComplete: isSetupComplete(config),
    orgName: config.orgName,
    spreadsheetId: config.spreadsheetId,
    serviceAccountEmail: getServiceAccountEmail(),
  };
}

export function isSetupComplete(config) {
  return Boolean(config.orgName && config.spreadsheetId && config.editPasswordHash && config.adminPasswordHash);
}

export async function saveSetupConfig(input, existingConfig = {}) {
  if (isFileConfigDisabled()) {
    throw new Error(
      "Vercel 배포 환경에서는 설정을 파일로 저장할 수 없습니다. Vercel 환경변수에 ORG_NAME, SPREADSHEET_ID, EDIT_PASSWORD_HASH, ADMIN_PASSWORD_HASH를 설정해 주세요.",
    );
  }

  const next = {
    ...existingConfig,
    orgName: String(input.orgName ?? existingConfig.orgName ?? "").trim(),
    spreadsheetId: input.spreadsheetUrl
      ? extractSpreadsheetId(input.spreadsheetUrl)
      : input.spreadsheetId || existingConfig.spreadsheetId || "",
    publicDataServiceKey:
      String(input.publicDataServiceKey ?? "").trim() || String(existingConfig.publicDataServiceKey ?? "").trim(),
    appSecret: existingConfig.appSecret || cryptoRandomSecret(),
    updatedAt: new Date().toISOString(),
  };

  if (input.editPassword) next.editPasswordHash = await hashPassword(String(input.editPassword));
  if (input.adminPassword) next.adminPasswordHash = await hashPassword(String(input.adminPassword));

  if (!next.orgName) throw new Error("기관명을 입력해 주세요.");
  if (!next.spreadsheetId) throw new Error("구글 스프레드시트 주소를 입력해 주세요.");
  if (!next.editPasswordHash) throw new Error("편집 비밀번호를 입력해 주세요.");
  if (!next.adminPasswordHash) throw new Error("관리 비밀번호를 입력해 주세요.");

  await writeStoredConfig(next);
  return next;
}

export function isFileConfigDisabled() {
  return process.env.VERCEL === "1" && process.env.ALLOW_FILE_CONFIG !== "true";
}

async function readStoredConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeStoredConfig(config) {
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function cryptoRandomSecret() {
  return globalThis.crypto.randomUUID().replaceAll("-", "");
}
