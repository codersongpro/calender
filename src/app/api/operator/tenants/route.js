import { fail, ok, readJson, requireOperator } from "../../../../lib/api.js";
import { ensureInstitutionDatabase, syncSettingsSheet } from "../../../../lib/sheetsDb.js";
import { createTenant, listTenants, tenantListItem } from "../../../../lib/tenantStore.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await requireOperator(request);
    const search = request.nextUrl.searchParams.get("search") || "";
    const tenants = await listTenants({ search });
    return ok({ tenants: tenants.map(tenantListItem) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request) {
  try {
    await requireOperator(request);
    const tenant = await createTenant(await readJson(request));
    await ensureInstitutionDatabase(tenant);
    await syncSettingsSheet(tenant);
    return ok({
      tenant: tenantListItem(tenant),
      urls: {
        site: `/s/${tenant.slug}`,
        admin: `/s/${tenant.slug}/admin`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
