import { randomBytes } from "node:crypto";

import { getSql } from "./db.js";
import { hashPassword } from "./security.js";
import { extractSpreadsheetId } from "./sheets.js";
import { normalizeTenantSlug } from "./tenantDomain.js";

const TENANT_COLUMNS = `
  id,
  slug,
  org_name,
  spreadsheet_id,
  view_password_hash,
  edit_password_hash,
  admin_password_hash,
  app_secret,
  public_data_service_key,
  status,
  created_at,
  updated_at
`;

const OPERATOR_PASSWORD_KEY = "operatorPasswordHash";

export async function ensureTenantSchema(sqlPromise = getSql()) {
  const sql = await sqlPromise;
  await runQuery(sql, `
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      org_name TEXT NOT NULL,
      spreadsheet_id TEXT NOT NULL,
      view_password_hash TEXT NOT NULL,
      edit_password_hash TEXT NOT NULL,
      admin_password_hash TEXT NOT NULL,
      app_secret TEXT NOT NULL,
      public_data_service_key TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await runQuery(sql, "CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants (status)");
  await runQuery(sql, `
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function hasOperatorPassword(options = {}) {
  return Boolean(await getOperatorPasswordHash(options));
}

export async function getOperatorPasswordHash(options = {}) {
  const sql = await getStoreSql(options);
  await ensureTenantSchema(sql);
  const rows = await runQuery(sql, "SELECT value FROM app_settings WHERE key = $1 LIMIT 1", [OPERATOR_PASSWORD_KEY]);
  return rows[0]?.value || process.env.OPERATOR_PASSWORD_HASH || "";
}

export async function createOperatorPassword(input, options = {}) {
  const sql = await getStoreSql(options);
  await ensureTenantSchema(sql);
  if (await hasOperatorPassword({ sql })) throw new Error("메인 운영자 비밀번호가 이미 설정되어 있습니다.");
  const record = await buildOperatorPasswordRecord(input);
  await runQuery(sql, "INSERT INTO app_settings (key, value) VALUES ($1, $2)", [record.key, record.value]);
  return { setupComplete: true };
}

export async function updateOperatorPassword(input, options = {}) {
  const sql = await getStoreSql(options);
  await ensureTenantSchema(sql);
  const patch = await buildOperatorPasswordPatch(input);
  await runQuery(
    sql,
    `INSERT INTO app_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [patch.key, patch.value],
  );
  return { setupComplete: true };
}

export async function listTenants({ search = "" } = {}, options = {}) {
  const sql = await getStoreSql(options);
  await ensureTenantSchema(sql);
  const term = String(search ?? "").trim();
  const rows = term
    ? await runQuery(
        sql,
        `SELECT ${TENANT_COLUMNS}
         FROM tenants
         WHERE slug ILIKE $1 OR org_name ILIKE $1
         ORDER BY created_at DESC`,
        [`%${term}%`],
      )
    : await runQuery(sql, `SELECT ${TENANT_COLUMNS} FROM tenants ORDER BY created_at DESC`);
  return rows.map(mapTenantRow);
}

export async function getTenantBySlug(slug, options = {}) {
  const sql = await getStoreSql(options);
  await ensureTenantSchema(sql);
  const normalizedSlug = normalizeTenantSlug(slug);
  const rows = await runQuery(sql, `SELECT ${TENANT_COLUMNS} FROM tenants WHERE slug = $1 LIMIT 1`, [normalizedSlug]);
  return rows[0] ? mapTenantRow(rows[0]) : null;
}

export async function createTenant(input, options = {}) {
  const sql = await getStoreSql(options);
  await ensureTenantSchema(sql);
  const record = await buildTenantCreateRecord(input);
  const rows = await runQuery(
    sql,
    `INSERT INTO tenants (
      id,
      slug,
      org_name,
      spreadsheet_id,
      view_password_hash,
      edit_password_hash,
      admin_password_hash,
      app_secret,
      public_data_service_key,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING ${TENANT_COLUMNS}`,
    [
      record.id,
      record.slug,
      record.orgName,
      record.spreadsheetId,
      record.viewPasswordHash,
      record.editPasswordHash,
      record.adminPasswordHash,
      record.appSecret,
      record.publicDataServiceKey,
      record.status,
    ],
  );
  return mapTenantRow(rows[0]);
}

export async function updateTenant(slug, input, options = {}) {
  const sql = await getStoreSql(options);
  await ensureTenantSchema(sql);
  const patch = await buildTenantUpdatePatch(input);
  const keys = Object.keys(patch);
  if (!keys.length) return getTenantBySlug(slug, { sql });

  const assignments = keys.map((key, index) => `${tenantDbColumn(key)} = $${index + 1}`);
  const values = keys.map((key) => patch[key]);
  values.push(normalizeTenantSlug(slug));
  const rows = await runQuery(
    sql,
    `UPDATE tenants
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE slug = $${values.length}
     RETURNING ${TENANT_COLUMNS}`,
    values,
  );
  if (!rows[0]) throw new Error("학교를 찾을 수 없습니다.");
  return mapTenantRow(rows[0]);
}

export async function setTenantStatus(slug, status, options = {}) {
  const sql = await getStoreSql(options);
  await ensureTenantSchema(sql);
  if (!["active", "suspended"].includes(status)) throw new Error("올바른 상태가 아닙니다.");
  const rows = await runQuery(
    sql,
    `UPDATE tenants
     SET status = $1, updated_at = NOW()
     WHERE slug = $2
     RETURNING ${TENANT_COLUMNS}`,
    [status, normalizeTenantSlug(slug)],
  );
  if (!rows[0]) throw new Error("학교를 찾을 수 없습니다.");
  return mapTenantRow(rows[0]);
}

export async function buildTenantCreateRecord(input) {
  const orgName = String(input.orgName ?? "").trim();
  if (!orgName) throw new Error("기관명을 입력해 주세요.");
  const spreadsheetId = extractSpreadsheetId(input.spreadsheetUrl || input.spreadsheetId);
  assertPasswordInput(input.viewPassword, "조회 비밀번호");
  assertPasswordInput(input.editPassword, "편집 비밀번호");
  assertPasswordInput(input.adminPassword, "관리 비밀번호");

  return {
    id: `tenant_${randomBytes(12).toString("hex")}`,
    slug: normalizeTenantSlug(input.slug),
    orgName,
    spreadsheetId,
    viewPasswordHash: await hashPassword(String(input.viewPassword)),
    editPasswordHash: await hashPassword(String(input.editPassword)),
    adminPasswordHash: await hashPassword(String(input.adminPassword)),
    appSecret: randomBytes(16).toString("hex"),
    publicDataServiceKey: String(input.publicDataServiceKey ?? "").trim(),
    status: "active",
  };
}

export async function buildTenantUpdatePatch(input) {
  const patch = {};
  const orgName = String(input.orgName ?? "").trim();
  if (orgName) patch.orgName = orgName;
  if (String(input.spreadsheetUrl ?? input.spreadsheetId ?? "").trim()) {
    patch.spreadsheetId = extractSpreadsheetId(input.spreadsheetUrl || input.spreadsheetId);
  }
  if (String(input.viewPassword ?? "")) patch.viewPasswordHash = await hashPassword(String(input.viewPassword));
  if (String(input.editPassword ?? "")) patch.editPasswordHash = await hashPassword(String(input.editPassword));
  if (String(input.adminPassword ?? "")) patch.adminPasswordHash = await hashPassword(String(input.adminPassword));
  const publicDataServiceKey = String(input.publicDataServiceKey ?? "").trim();
  if (input.clearPublicDataServiceKey === true || input.clearPublicDataServiceKey === "true") {
    patch.publicDataServiceKey = "";
  } else if (publicDataServiceKey) {
    patch.publicDataServiceKey = publicDataServiceKey;
  }
  return patch;
}

export async function buildOperatorPasswordRecord(input) {
  assertPasswordInput(input.password, "운영자 비밀번호");
  return {
    key: OPERATOR_PASSWORD_KEY,
    value: await hashPassword(String(input.password)),
  };
}

export async function buildOperatorPasswordPatch(input) {
  return buildOperatorPasswordRecord(input);
}

export function tenantListItem(tenant) {
  return {
    id: tenant.id,
    slug: tenant.slug,
    orgName: tenant.orgName,
    status: tenant.status,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

export function mapTenantRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    orgName: row.org_name,
    spreadsheetId: row.spreadsheet_id,
    viewPasswordHash: row.view_password_hash,
    editPasswordHash: row.edit_password_hash,
    adminPasswordHash: row.admin_password_hash,
    appSecret: row.app_secret,
    publicDataServiceKey: row.public_data_service_key ?? "",
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function getStoreSql(options) {
  return options.sql ?? getSql();
}

async function runQuery(sql, query, params = []) {
  if (typeof sql.query === "function") return sql.query(query, params);
  return sql(query, params);
}

function tenantDbColumn(key) {
  const columns = {
    orgName: "org_name",
    spreadsheetId: "spreadsheet_id",
    viewPasswordHash: "view_password_hash",
    editPasswordHash: "edit_password_hash",
    adminPasswordHash: "admin_password_hash",
    publicDataServiceKey: "public_data_service_key",
  };
  if (!columns[key]) throw new Error(`지원하지 않는 설정 항목입니다: ${key}`);
  return columns[key];
}

function assertPasswordInput(value, label) {
  if (!String(value ?? "")) throw new Error(`${label}를 입력해 주세요.`);
}

function toIsoString(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
