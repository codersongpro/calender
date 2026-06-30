import { fail, ok, readJson, requireToken } from "../../../../lib/api.js";
import { getCurrentSchoolYear } from "../../../../lib/domain.js";
import { refreshSchoolYearHolidays } from "../../../../lib/holidays.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { config } = await requireToken(request, "admin");
    const { schoolYear } = await readJson(request);
    const holidays = await refreshSchoolYearHolidays(config, Number(schoolYear || getCurrentSchoolYear()));
    return ok({ count: holidays.length, holidays });
  } catch (error) {
    return fail(error);
  }
}
