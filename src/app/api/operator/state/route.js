import { fail, ok } from "../../../../lib/api.js";
import { hasOperatorPassword } from "../../../../lib/tenantStore.js";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok({ setupComplete: await hasOperatorPassword() });
  } catch (error) {
    return fail(error);
  }
}
