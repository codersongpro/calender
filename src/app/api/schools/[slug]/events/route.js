import { assertRequiredFields, fail, ok, readJson, requireTenantSession } from "../../../../../lib/api.js";
import { createEvent } from "../../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function POST(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "edit");
    const input = await readJson(request);
    assertRequiredFields(input, ["date", "title"]);
    return ok({ event: await createEvent(tenant, input) });
  } catch (error) {
    return fail(error);
  }
}
