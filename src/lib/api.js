import { NextResponse } from "next/server";

import { getAppConfig, isSetupComplete } from "./configStore.js";
import { verifySessionToken } from "./security.js";

export const runtime = "nodejs";

export function ok(data, init) {
  return NextResponse.json(data, init);
}

export function fail(error, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function requireConfiguredApp() {
  const config = await getAppConfig();
  if (!isSetupComplete(config)) throw new Error("앱 설정이 필요합니다.");
  return config;
}

export async function requireToken(request, scope) {
  const config = await requireConfiguredApp();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const payload = verifySessionToken(token, config.appSecret, scope);
  if (!payload) throw new Error("권한이 없거나 세션이 만료되었습니다.");
  return { config, payload };
}

export function assertRequiredFields(input, fields) {
  const missing = fields.filter((field) => !String(input[field] ?? "").trim());
  if (missing.length > 0) {
    throw new Error(`${missing.join(", ")} 값을 입력해 주세요.`);
  }
}
