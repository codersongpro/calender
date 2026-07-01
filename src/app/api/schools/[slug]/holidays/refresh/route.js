import { fail, ok, readJson, requireTenantSession } from "../../../../../../lib/api.js";
import { getCurrentSchoolYear } from "../../../../../../lib/domain.js";
import { refreshSchoolYearHolidays } from "../../../../../../lib/holidays.js";

export const runtime = "nodejs";

export async function POST(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "admin");
    const { schoolYear } = await readJson(request);
    const holidays = await refreshSchoolYearHolidays(tenant, Number(schoolYear || getCurrentSchoolYear()));
    return ok({ count: holidays.length, holidays });
  } catch (error) {
    return fail(error);
  }
}
