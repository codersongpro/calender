import { createTenantAuthResponse, fail, readJson, requireTenant } from "../../../../../../lib/api.js";

export const runtime = "nodejs";

export async function POST(request, context) {
  try {
    const { slug, scope } = await context.params;
    if (!["view", "edit", "admin"].includes(scope)) throw new Error("올바른 권한 범위가 아닙니다.");
    const tenant = await requireTenant(slug);
    const { password } = await readJson(request);
    return await createTenantAuthResponse(request, tenant, scope, password);
  } catch (error) {
    return fail(error);
  }
}
