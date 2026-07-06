const SLUG_MIN_LENGTH = 2;
const SLUG_MAX_LENGTH = 64;

export function normalizeTenantSlug(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_+/g, "")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized) throw new Error("학교코드를 입력해 주세요.");
  if (normalized.length < SLUG_MIN_LENGTH) throw new Error("학교코드는 2자 이상이어야 합니다.");
  if (normalized.length > SLUG_MAX_LENGTH) throw new Error("학교코드는 64자 이하여야 합니다.");
  return normalized;
}

export function publicTenantSummary(tenant) {
  if (!tenant) return { exists: false, authRequired: true };
  return {
    exists: true,
    slug: tenant.slug,
    status: tenant.status,
    authRequired: tenantRequiresViewAuth(tenant),
  };
}

export function requireActiveTenant(tenant) {
  if (!tenant) throw new Error("학교를 찾을 수 없습니다.");
  if (tenant.status !== "active") throw new Error("이 학교 사이트는 현재 중지되었습니다.");
  return tenant;
}

export function tenantRequiresViewAuth(tenant) {
  return Boolean(String(tenant?.viewPasswordHash ?? "").trim());
}
