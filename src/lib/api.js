import { NextResponse } from "next/server";

import { verifyPassword, createSessionToken, verifySessionToken } from "./security.js";
import {
  assertAuthAttemptAllowed,
  authAttemptKey,
  recordAuthFailure,
  recordAuthSuccess,
} from "./rateLimit.js";
import { getTenantBySlug } from "./tenantStore.js";
import { getOperatorPasswordHash } from "./tenantStore.js";
import { publicTenantSummary, requireActiveTenant, tenantRequiresViewAuth } from "./tenantDomain.js";
import {
  createScopedSessionToken,
  schoolSessionCookieName,
  verifyScopedSessionToken,
} from "./tenantSecurity.js";

export const runtime = "nodejs";

export const OPERATOR_COOKIE = "operator_session";

export function ok(data, init) {
  return NextResponse.json(data, init);
}

export function fail(error, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status: error?.status || status });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function getPublicTenantState(slug) {
  return publicTenantSummary(await getTenantBySlug(slug));
}

export async function requireTenant(slug) {
  return requireActiveTenant(await getTenantBySlug(slug));
}

export async function requireTenantSession(request, slug, requiredScope) {
  const tenant = await requireTenant(slug);
  const payload = readTenantSessionPayload(request, tenant, requiredScope);
  if (!payload) throw httpError("권한이 없거나 세션이 만료되었습니다.", 401);
  return { tenant, payload };
}

export async function createTenantAuthResponse(request, tenant, scope, password) {
  if (scope === "view" && !tenantRequiresViewAuth(tenant)) {
    return ok({ authenticated: true, scope });
  }
  const attemptKey = authAttemptKey(request, `tenant:${tenant.slug}:${scope}`);
  assertAuthAttemptAllowed(attemptKey);
  const passwordHash = tenantPasswordHash(tenant, scope);
  if (!(await verifyPassword(String(password ?? ""), passwordHash))) {
    recordAuthFailure(attemptKey);
    throw httpError("비밀번호가 올바르지 않습니다.", 401);
  }
  recordAuthSuccess(attemptKey);
  const token = createScopedSessionToken(tenant, scope);
  const response = ok({ authenticated: true, scope });
  response.cookies.set(schoolSessionCookieName(tenant.slug, scope), token, sessionCookieOptions(scope));
  return response;
}

export async function createOperatorAuthResponse(request, password) {
  const attemptKey = authAttemptKey(request, "operator");
  assertAuthAttemptAllowed(attemptKey);
  const passwordHash = await getOperatorPasswordHash();
  if (!passwordHash) throw httpError("메인 운영자 비밀번호를 먼저 설정해 주세요.", 409);
  if (!(await verifyPassword(String(password ?? ""), passwordHash))) {
    recordAuthFailure(attemptKey);
    throw httpError("운영자 비밀번호가 올바르지 않습니다.", 401);
  }
  recordAuthSuccess(attemptKey);
  const token = createSessionToken(
    { scope: "operator", expiresAt: Date.now() + 1000 * 60 * 60 * 4 },
    operatorSessionSecret(),
  );
  const response = ok({ authenticated: true, scope: "operator" });
  response.cookies.set(OPERATOR_COOKIE, token, sessionCookieOptions("operator"));
  return response;
}

export async function requireOperator(request) {
  const token = request.cookies?.get(OPERATOR_COOKIE)?.value || bearerToken(request);
  const payload = verifySessionToken(token, operatorSessionSecret(), "operator");
  if (!payload) throw httpError("운영자 권한이 필요합니다.", 401);
  return payload;
}

export function clearAuthCookie(response, name) {
  response.cookies.set(name, "", { path: "/", maxAge: 0 });
  return response;
}

export function assertRequiredFields(input, fields) {
  const missing = fields.filter((field) => !String(input[field] ?? "").trim());
  if (missing.length > 0) {
    throw new Error(`${missing.join(", ")} 값을 입력해 주세요.`);
  }
}

function readTenantSessionPayload(request, tenant, requiredScope) {
  if (requiredScope === "view" && !tenantRequiresViewAuth(tenant)) {
    return { tenantId: tenant.id, slug: tenant.slug, scope: "view", public: true };
  }
  for (const scope of ["admin", "edit", "view"]) {
    const token = request.cookies?.get(schoolSessionCookieName(tenant.slug, scope))?.value;
    const payload = verifyScopedSessionToken(token, tenant, requiredScope);
    if (payload) return payload;
  }
  return verifyScopedSessionToken(bearerToken(request), tenant, requiredScope);
}

function tenantPasswordHash(tenant, scope) {
  if (scope === "view") return tenant.viewPasswordHash;
  if (scope === "edit") return tenant.editPasswordHash;
  if (scope === "admin") return tenant.adminPasswordHash;
  throw new Error("올바른 권한 범위가 아닙니다.");
}

function sessionCookieOptions(scope) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: scopeMaxAge(scope),
  };
}

function scopeMaxAge(scope) {
  if (scope === "view") return 60 * 60 * 12;
  if (scope === "edit") return 60 * 60 * 8;
  return 60 * 60 * 2;
}

function operatorSessionSecret() {
  const secret = process.env.OPERATOR_SESSION_SECRET || process.env.APP_SECRET || process.env.OPERATOR_PASSWORD_HASH;
  if (!secret) throw httpError("운영자 세션 비밀값이 필요합니다.", 500);
  return secret;
}

function bearerToken(request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
}

export function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
