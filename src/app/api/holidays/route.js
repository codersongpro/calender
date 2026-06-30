import { assertRequiredFields, fail, ok, readJson, requireConfiguredApp, requireToken } from "../../../lib/api.js";
import { listHolidays, saveHoliday } from "../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = await requireConfiguredApp();
    return ok({ holidays: await listHolidays(config) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request) {
  try {
    const { config } = await requireToken(request, "admin");
    const input = await readJson(request);
    assertRequiredFields(input, ["date", "name"]);
    return ok({ holiday: await saveHoliday(config, input) });
  } catch (error) {
    return fail(error);
  }
}
