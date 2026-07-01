import { fail, ok, requireTenantSession } from "../../../../../lib/api.js";
import { getCurrentSchoolYear, getMonthOptions } from "../../../../../lib/domain.js";
import { getMonthData } from "../../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function GET(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "view");
    const params = request.nextUrl.searchParams;
    const schoolYear = Number(params.get("schoolYear") || getCurrentSchoolYear());
    const selectedMonth = Number(params.get("month") || new Date().getMonth() + 1);
    const monthOption =
      getMonthOptions(schoolYear).find((item) => item.month === selectedMonth) ?? getMonthOptions(schoolYear)[0];
    const data = await getMonthData(tenant, { year: monthOption.year, month: monthOption.month });
    return ok({ schoolYear, monthOptions: getMonthOptions(schoolYear), ...data });
  } catch (error) {
    return fail(error);
  }
}
