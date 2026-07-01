import { fail, ok, readJson, requireOperator } from "../../../../lib/api.js";
import { updateOperatorPassword } from "../../../../lib/tenantStore.js";

export const runtime = "nodejs";

export async function PATCH(request) {
  try {
    await requireOperator(request);
    const input = await readJson(request);
    await updateOperatorPassword(input);
    return ok({ updated: true });
  } catch (error) {
    return fail(error);
  }
}
