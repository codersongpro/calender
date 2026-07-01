import { fail, ok, readJson } from "../../../../lib/api.js";
import { createOperatorPassword } from "../../../../lib/tenantStore.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const input = await readJson(request);
    await createOperatorPassword(input);
    return ok({ setupComplete: true });
  } catch (error) {
    return fail(error);
  }
}
