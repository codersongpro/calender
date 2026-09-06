import { fail, ok, readJson, requireTenantSession } from "../../../../../lib/api.js";
import { getServiceAccountEmail } from "../../../../../lib/sheets.js";
import { ensureInstitutionDatabase, syncSettingsSheet } from "../../../../../lib/sheetsDb.js";
import { getTenantBySlug, updateTenant } from "../../../../../lib/tenantStore.js";
import { publicTenantSummary } from "../../../../../lib/tenantDomain.js";
import { readTenantSessionPayload } from "../../../../../lib/tenantSecurity.js";
import { getPublicDataServiceKeyState } from "../../../../../lib/holidays.js";

export const runtime = "nodejs";

export async function GET(request, context) {
  try {
    const { slug } = await context.params;
    // One tenant lookup for the whole response: the public summary and the
    // session check used to each hit the database separately, doubling the
    // round trips the planner waits on before it can load a month.
    const tenant = await getTenantBySlug(slug);
    const publicState = publicTenantSummary(tenant);
    if (!publicState.exists || publicState.status !== "active") return ok(publicState);

    const payload = readTenantSessionPayload(request, tenant, "view");
    if (!payload) return ok({ ...publicState, authenticated: false });

    const canAdmin = payload.scope === "admin";
    return ok({
      ...publicState,
      authenticated: true,
      orgName: tenant.orgName,
      canEdit: true,
      canAdmin,
      ...(canAdmin ? { spreadsheetId: tenant.spreadsheetId } : {}),
      ...(canAdmin ? getPublicDataServiceKeyState(tenant) : {}),
      // A malformed service-account env var must not read as "not signed in":
      // that used to leave the planner waiting on a month load it never made.
      serviceAccountEmail: readServiceAccountEmail(),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request, context) {
  try {
    const { slug } = await context.params;
    await requireTenantSession(request, slug, "admin");
    const tenant = await updateTenant(slug, await readJson(request));
    await ensureInstitutionDatabase(tenant);
    await syncSettingsSheet(tenant);
    return ok({
      orgName: tenant.orgName,
      slug: tenant.slug,
      ...getPublicDataServiceKeyState(tenant),
      serviceAccountEmail: getServiceAccountEmail(),
    });
  } catch (error) {
    return fail(error);
  }
}

function readServiceAccountEmail() {
  try {
    return getServiceAccountEmail();
  } catch {
    return "";
  }
}
