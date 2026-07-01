import { createHash } from "node:crypto";

import { createSessionToken, verifySessionToken } from "./security.js";

const SCHOOL_SCOPE_RANK = {
  view: 1,
  edit: 2,
  admin: 3,
};

export function createScopedSessionToken(tenant, scope, { now = Date.now(), ttlMs } = {}) {
  if (!tenant?.id || !tenant?.slug || !tenant?.appSecret) throw new Error("학교 설정이 올바르지 않습니다.");
  if (!SCHOOL_SCOPE_RANK[scope]) throw new Error("올바른 권한 범위가 아닙니다.");
  return createSessionToken(
    {
      tenantId: tenant.id,
      slug: tenant.slug,
      scope,
      expiresAt: now + Number(ttlMs ?? defaultTtlMs(scope)),
    },
    tenant.appSecret,
    { now },
  );
}

export function verifyScopedSessionToken(token, tenant, requiredScope, { now = Date.now() } = {}) {
  if (!tenant?.appSecret) return null;
  const payload = verifySessionToken(token, tenant.appSecret, null, { now });
  if (!payload) return null;
  if (payload.tenantId !== tenant.id || payload.slug !== tenant.slug) return null;
  if (!scopeAllows(payload.scope, requiredScope)) return null;
  return payload;
}

export function scopeAllows(actualScope, requiredScope) {
  if (actualScope === "operator" || requiredScope === "operator") return actualScope === requiredScope;
  return (SCHOOL_SCOPE_RANK[actualScope] ?? 0) >= (SCHOOL_SCOPE_RANK[requiredScope] ?? Infinity);
}

export function schoolSessionCookieName(slug, scope) {
  const slugHash = createHash("sha256").update(String(slug)).digest("base64url").slice(0, 16);
  return `school_${scope}_${slugHash}`;
}

function defaultTtlMs(scope) {
  if (scope === "view") return 1000 * 60 * 60 * 12;
  if (scope === "edit") return 1000 * 60 * 60 * 8;
  return 1000 * 60 * 60 * 2;
}
