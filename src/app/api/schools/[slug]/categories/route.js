import { fail, ok, requireTenantSession } from "../../../../../lib/api.js";
import { listCategories } from "../../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function GET(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "view");
    return ok({ categories: await listCategories(tenant) });
  } catch (error) {
    return fail(error);
  }
}
