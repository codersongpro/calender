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
    // Reads share the short-lived sheet cache so opening a page or flipping
    // months doesn't wait on a fresh Google Sheets read every time. The client
    // asks for refresh=1 right after it edits, which bypasses the cache so the
    // change shows up immediately even if another instance served the write.
    const refresh = params.get("refresh") === "1";
    const data = await getMonthData(
      tenant,
      { year: monthOption.year, month: monthOption.month },
      refresh ? { cacheTtlMs: 0 } : {},
    );
    return ok({ schoolYear, monthOptions: getMonthOptions(schoolYear), ...data });
  } catch (error) {
    return fail(error);
  }
}
