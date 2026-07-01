import { fail, ok, readJson, requireTenantSession } from "../../../../../lib/api.js";
import { getCurrentSchoolYear } from "../../../../../lib/domain.js";
import { importLegacyMonthlyTabs } from "../../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function POST(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "admin");
    const { schoolYear } = await readJson(request);
    return ok(await importLegacyMonthlyTabs(tenant, Number(schoolYear || getCurrentSchoolYear())));
  } catch (error) {
    return fail(error);
  }
}
