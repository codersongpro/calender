import { fail, ok, readJson, requireConfiguredApp } from "../../../../lib/api.js";
import { createSessionToken, verifyPassword } from "../../../../lib/security.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const config = await requireConfiguredApp();
    const { password } = await readJson(request);
    if (!(await verifyPassword(String(password ?? ""), config.editPasswordHash))) {
      return fail("편집 비밀번호가 올바르지 않습니다.", 401);
    }
    return ok({
      token: createSessionToken({ scope: "edit", expiresAt: Date.now() + 1000 * 60 * 60 * 8 }, config.appSecret),
    });
  } catch (error) {
    return fail(error);
  }
}
