import { fail, ok, readJson, requireConfiguredApp } from "../../../../lib/api.js";
import { createSessionToken, verifyPassword } from "../../../../lib/security.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const config = await requireConfiguredApp();
    const { password } = await readJson(request);
    if (!(await verifyPassword(String(password ?? ""), config.adminPasswordHash))) {
      return fail("관리 비밀번호가 올바르지 않습니다.", 401);
    }
    return ok({
      token: createSessionToken({ scope: "admin", expiresAt: Date.now() + 1000 * 60 * 60 * 2 }, config.appSecret),
    });
  } catch (error) {
    return fail(error);
  }
}
