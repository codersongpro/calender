import { fail, ok, readJson, requireTenantSession } from "../../../../../lib/api.js";
import { getCurrentSchoolYear } from "../../../../../lib/domain.js";
import { appendImportedEvents, importLegacyMonthlyTabs } from "../../../../../lib/sheetsDb.js";
import { parseUploadedWorkbook } from "../../../../../lib/workbookImport.js";

export const runtime = "nodejs";

export async function POST(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "admin");
    if (String(request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData();
      const schoolYear = Number(form.get("schoolYear") || getCurrentSchoolYear());
      const parsed = await parseUploadedWorkbook(form.get("file"), { schoolYear });
      return ok(
        await appendImportedEvents(tenant, parsed.events, {
          action: "import-workbook",
          sheets: parsed.sheets,
          warnings: parsed.warnings,
        }),
      );
    }

    const { schoolYear } = await readJson(request);
    return ok(await importLegacyMonthlyTabs(tenant, Number(schoolYear || getCurrentSchoolYear())));
  } catch (error) {
    return fail(error);
  }
}
