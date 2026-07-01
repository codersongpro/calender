import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTenantSlug,
  publicTenantSummary,
  requireActiveTenant,
} from "../src/lib/tenantDomain.js";
import {
  createScopedSessionToken,
  schoolSessionCookieName,
  scopeAllows,
  verifyScopedSessionToken,
} from "../src/lib/tenantSecurity.js";
import {
  buildTenantCreateRecord,
  buildTenantUpdatePatch,
  buildOperatorPasswordRecord,
  buildOperatorPasswordPatch,
  tenantListItem,
} from "../src/lib/tenantStore.js";
import { verifyPassword } from "../src/lib/security.js";

test("tenant slugs are normalized for school URLs", () => {
  assert.equal(normalizeTenantSlug("  Seoul ES  "), "seoul-es");
  assert.equal(normalizeTenantSlug("청담 초등학교"), "청담-초등학교");
  assert.equal(normalizeTenantSlug("A__B!!C"), "abc");
});

test("tenant slug validation rejects empty or unsafe values", () => {
  assert.throws(() => normalizeTenantSlug("!!!"), /학교코드/);
  assert.throws(() => normalizeTenantSlug("a"), /2자/);
  assert.throws(() => normalizeTenantSlug("x".repeat(65)), /64자/);
});

test("public tenant summary never exposes private configuration", () => {
  const summary = publicTenantSummary({
    id: "tenant_1",
    slug: "school-a",
    orgName: "가람초등학교",
    spreadsheetId: "secret-sheet",
    viewPasswordHash: "view-hash",
    editPasswordHash: "edit-hash",
    adminPasswordHash: "admin-hash",
    appSecret: "secret",
    status: "active",
  });

  assert.deepEqual(summary, {
    exists: true,
    slug: "school-a",
    status: "active",
    authRequired: true,
  });
});

test("suspended tenants are blocked before sheet data is read", () => {
  assert.throws(
    () => requireActiveTenant({ slug: "school-a", status: "suspended" }),
    /중지/,
  );
});

test("school sessions are bound to tenant id, slug, and allowed scopes", () => {
  const tenant = { id: "tenant_a", slug: "school-a", appSecret: "school-secret" };
  const token = createScopedSessionToken(tenant, "edit", { now: 1_000, ttlMs: 60_000 });

  assert.equal(verifyScopedSessionToken(token, tenant, "view", { now: 2_000 })?.scope, "edit");
  assert.equal(verifyScopedSessionToken(token, tenant, "edit", { now: 2_000 })?.scope, "edit");
  assert.equal(verifyScopedSessionToken(token, tenant, "admin", { now: 2_000 }), null);
  assert.equal(
    verifyScopedSessionToken(token, { ...tenant, id: "tenant_b", slug: "school-b" }, "view", { now: 2_000 }),
    null,
  );
});

test("scope ordering lets stronger school roles satisfy weaker school routes", () => {
  assert.equal(scopeAllows("view", "view"), true);
  assert.equal(scopeAllows("edit", "view"), true);
  assert.equal(scopeAllows("admin", "edit"), true);
  assert.equal(scopeAllows("view", "edit"), false);
  assert.equal(scopeAllows("operator", "admin"), false);
});

test("school session cookie names are ascii and stable per school scope", () => {
  assert.match(schoolSessionCookieName("청담-초등학교", "view"), /^school_view_[a-zA-Z0-9_-]{16}$/);
  assert.notEqual(
    schoolSessionCookieName("청담-초등학교", "view"),
    schoolSessionCookieName("청담-초등학교", "edit"),
  );
  assert.notEqual(
    schoolSessionCookieName("청담-초등학교", "view"),
    schoolSessionCookieName("다온-초등학교", "view"),
  );
});

test("tenant create records hash every school password and extract spreadsheet ids", async () => {
  const record = await buildTenantCreateRecord({
    slug: " Seoul ES ",
    orgName: "서울초등학교",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1uvYR2gcjBBVU-YOn7bVpREp7RXeU-D6L52tvCFsJ-2Y/edit",
    viewPassword: "view-secret",
    editPassword: "edit-secret",
    adminPassword: "admin-secret",
  });

  assert.equal(record.slug, "seoul-es");
  assert.equal(record.orgName, "서울초등학교");
  assert.equal(record.spreadsheetId, "1uvYR2gcjBBVU-YOn7bVpREp7RXeU-D6L52tvCFsJ-2Y");
  assert.equal(record.status, "active");
  assert.match(record.appSecret, /^[a-f0-9]{32}$/);
  assert.equal(await verifyPassword("view-secret", record.viewPasswordHash), true);
  assert.equal(await verifyPassword("edit-secret", record.editPasswordHash), true);
  assert.equal(await verifyPassword("admin-secret", record.adminPasswordHash), true);
});

test("tenant create records require all three school passwords", async () => {
  await assert.rejects(
    () =>
      buildTenantCreateRecord({
        slug: "school-a",
        orgName: "가람초등학교",
        spreadsheetUrl: "sheet-id-12345678901234567890",
        viewPassword: "view-secret",
        editPassword: "edit-secret",
      }),
    /관리 비밀번호/,
  );
});

test("tenant update patches only include provided changes and hashed new passwords", async () => {
  const patch = await buildTenantUpdatePatch({
    orgName: " 다온초 ",
    spreadsheetUrl: "",
    viewPassword: "new-view",
    editPassword: "",
    adminPassword: "",
  });

  assert.equal(patch.orgName, "다온초");
  assert.equal("spreadsheetId" in patch, false);
  assert.equal("editPasswordHash" in patch, false);
  assert.equal("adminPasswordHash" in patch, false);
  assert.equal(await verifyPassword("new-view", patch.viewPasswordHash), true);
});

test("tenant list items redact secrets for the operator dashboard", () => {
  assert.deepEqual(
    tenantListItem({
      id: "tenant_1",
      slug: "school-a",
      orgName: "가람초등학교",
      spreadsheetId: "secret-sheet",
      viewPasswordHash: "view-hash",
      editPasswordHash: "edit-hash",
      adminPasswordHash: "admin-hash",
      appSecret: "secret",
      status: "active",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T01:00:00.000Z",
    }),
    {
      id: "tenant_1",
      slug: "school-a",
      orgName: "가람초등학교",
      status: "active",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T01:00:00.000Z",
    },
  );
});

test("operator password records hash the initial main operator password", async () => {
  const record = await buildOperatorPasswordRecord({ password: "2679" });

  assert.equal(record.key, "operatorPasswordHash");
  assert.equal(await verifyPassword("2679", record.value), true);
});

test("operator password records reject missing initial passwords", async () => {
  await assert.rejects(() => buildOperatorPasswordRecord({ password: "" }), /운영자 비밀번호/);
});

test("operator password patches hash changed main operator passwords", async () => {
  const patch = await buildOperatorPasswordPatch({ password: "new-main-secret" });

  assert.equal(await verifyPassword("new-main-secret", patch.value), true);
});
