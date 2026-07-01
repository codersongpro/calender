import { fail, ok, requireOperator } from "../../../../../../lib/api.js";
import { ensureInstitutionDatabase, syncSettingsSheet } from "../../../../../../lib/sheetsDb.js";
import { getTenantBySlug } from "../../../../../../lib/tenantStore.js";
import { requireActiveTenant } from "../../../../../../lib/tenantDomain.js";

export const runtime = "nodejs";

export async function POST(request, context) {
  try {
    await requireOperator(request);
    const { slug } = await context.params;
    const tenant = requireActiveTenant(await getTenantBySlug(slug));
    const sheet = await ensureInstitutionDatabase(tenant);
    await syncSettingsSheet(tenant);
    return ok({ ok: true, sheet });
  } catch (error) {
    return fail(error);
  }
}
