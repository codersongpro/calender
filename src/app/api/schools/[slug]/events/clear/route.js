import { fail, ok, readJson, requireTenantSession } from "../../../../../../lib/api.js";
import { clearEventsInRange } from "../../../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function POST(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "admin");
    return ok(await clearEventsInRange(tenant, await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}
