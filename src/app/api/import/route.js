import { fail, ok, readJson, requireToken } from "../../../lib/api.js";
import { getCurrentSchoolYear } from "../../../lib/domain.js";
import { importLegacyMonthlyTabs } from "../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { config } = await requireToken(request, "admin");
    const { schoolYear } = await readJson(request);
    return ok(await importLegacyMonthlyTabs(config, Number(schoolYear || getCurrentSchoolYear())));
  } catch (error) {
    return fail(error);
  }
}
