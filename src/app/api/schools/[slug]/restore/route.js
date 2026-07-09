import { fail, ok, readJson, requireTenantSession } from "../../../../../lib/api.js";
import { restoreInstitutionData } from "../../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function POST(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "admin");
    const backup = await readJson(request);
    return ok({ restored: await restoreInstitutionData(tenant, backup) });
  } catch (error) {
    return fail(error);
  }
}
