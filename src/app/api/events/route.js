import { assertRequiredFields, fail, ok, readJson, requireToken } from "../../../lib/api.js";
import { createEvent } from "../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { config } = await requireToken(request, "edit");
    const input = await readJson(request);
    assertRequiredFields(input, ["date", "title"]);
    return ok({ event: await createEvent(config, input) });
  } catch (error) {
    return fail(error);
  }
}
