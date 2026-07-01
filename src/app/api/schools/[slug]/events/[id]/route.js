import { fail, ok, readJson, requireTenantSession } from "../../../../../../lib/api.js";
import { deleteEvent, updateEvent } from "../../../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function PATCH(request, context) {
  try {
    const { slug, id } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "edit");
    return ok({ event: await updateEvent(tenant, id, await readJson(request)) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request, context) {
  try {
    const { slug, id } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "edit");
    return ok({ event: await deleteEvent(tenant, id) });
  } catch (error) {
    return fail(error);
  }
}
