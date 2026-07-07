import { fail, ok, readJson, requireTenantSession } from "../../../../../../lib/api.js";
import { undoImportBatch } from "../../../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function POST(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "admin");
    const { batchId } = await readJson(request);
    return ok(await undoImportBatch(tenant, batchId));
  } catch (error) {
    return fail(error);
  }
}
