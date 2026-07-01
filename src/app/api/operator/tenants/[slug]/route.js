import { fail, ok, readJson, requireOperator } from "../../../../../lib/api.js";
import { ensureInstitutionDatabase, syncSettingsSheet } from "../../../../../lib/sheetsDb.js";
import { setTenantStatus, tenantListItem, updateTenant } from "../../../../../lib/tenantStore.js";

export const runtime = "nodejs";

export async function PATCH(request, context) {
  try {
    await requireOperator(request);
    const { slug } = await context.params;
    const input = await readJson(request);
    const tenant = input.status
      ? await setTenantStatus(slug, String(input.status))
      : await updateTenant(slug, input);
    if (!input.status) {
      await ensureInstitutionDatabase(tenant);
      await syncSettingsSheet(tenant);
    }
    return ok({ tenant: tenantListItem(tenant) });
  } catch (error) {
    return fail(error);
  }
}
