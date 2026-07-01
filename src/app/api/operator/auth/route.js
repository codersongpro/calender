import { createOperatorAuthResponse, fail, readJson } from "../../../../lib/api.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { password } = await readJson(request);
    return await createOperatorAuthResponse(request, password);
  } catch (error) {
    return fail(error);
  }
}
