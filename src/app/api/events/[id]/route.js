import { fail, ok, readJson, requireToken } from "../../../../lib/api.js";
import { deleteEvent, updateEvent } from "../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function PATCH(request, context) {
  try {
    const { config } = await requireToken(request, "edit");
    const { id } = await context.params;
    return ok({ event: await updateEvent(config, id, await readJson(request)) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request, context) {
  try {
    const { config } = await requireToken(request, "edit");
    const { id } = await context.params;
    return ok({ event: await deleteEvent(config, id) });
  } catch (error) {
    return fail(error);
  }
}
