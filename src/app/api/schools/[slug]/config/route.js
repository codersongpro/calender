import {
  fail,
  getPublicTenantState,
  ok,
  readJson,
  requireTenantSession,
} from "../../../../../lib/api.js";
import { getServiceAccountEmail } from "../../../../../lib/sheets.js";
import { ensureInstitutionDatabase, syncSettingsSheet } from "../../../../../lib/sheetsDb.js";
import { updateTenant } from "../../../../../lib/tenantStore.js";
import { getPublicDataServiceKeyState } from "../../../../../lib/holidays.js";

export const runtime = "nodejs";

export async function GET(request, context) {
  try {
    const { slug } = await context.params;
    const publicState = await getPublicTenantState(slug);
    if (!publicState.exists || publicState.status !== "active") return ok(publicState);

    try {
      const { tenant, payload } = await requireTenantSession(request, slug, "view");
      const canAdmin = payload.scope === "admin";
      return ok({
        ...publicState,
        authenticated: true,
        orgName: tenant.orgName,
        canEdit: true,
        canAdmin,
        ...(canAdmin ? { spreadsheetId: tenant.spreadsheetId } : {}),
        ...(canAdmin ? getPublicDataServiceKeyState(tenant) : {}),
        serviceAccountEmail: getServiceAccountEmail(),
      });
    } catch {
      return ok({ ...publicState, authenticated: false });
    }
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
