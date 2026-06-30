import { fail, ok, requireConfiguredApp } from "../../../lib/api.js";
import { listCategories } from "../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = await requireConfiguredApp();
    return ok({ categories: await listCategories(config) });
  } catch (error) {
    return fail(error);
  }
}
