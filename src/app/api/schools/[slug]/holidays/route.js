import { assertRequiredFields, fail, ok, readJson, requireTenantSession } from "../../../../../lib/api.js";
import { listHolidays, saveHoliday } from "../../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function GET(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "view");
    return ok({ holidays: await listHolidays(tenant) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "admin");
    const input = await readJson(request);
    assertRequiredFields(input, ["date", "name"]);
    return ok({ holiday: await saveHoliday(tenant, input) });
  } catch (error) {
    return fail(error);
  }
}
