import { fail, ok, readJson, requireToken } from "../../../lib/api.js";
import { getAppConfig, getPublicConfig, isSetupComplete, saveSetupConfig } from "../../../lib/configStore.js";
import { ensureInstitutionDatabase, syncSettingsSheet } from "../../../lib/sheetsDb.js";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok(await getPublicConfig());
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request) {
  try {
    const existing = await getAppConfig();
    if (isSetupComplete(existing)) {
      await requireToken(request, "admin");
    }
    const input = await readJson(request);
    const config = await saveSetupConfig(input, existing);
    await ensureInstitutionDatabase(config);
    await syncSettingsSheet(config);
    return ok(await getPublicConfig());
  } catch (error) {
    return fail(error);
  }
}
