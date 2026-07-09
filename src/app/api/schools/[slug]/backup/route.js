import { fail, ok, requireTenantSession } from "../../../../../lib/api.js";
import { listCategories, listEvents, listHolidays } from "../../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function GET(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "admin");
    const [events, holidays, categories] = await Promise.all([
      listEvents(tenant),
      listHolidays(tenant),
      listCategories(tenant),
    ]);
    return ok({
      orgName: tenant.orgName,
      exportedAt: new Date().toISOString(),
      events,
      holidays,
      categories,
    });
  } catch (error) {
    return fail(error);
  }
}
