import { NextResponse } from "next/server";

import { getTenantBySlug } from "../../../../../lib/tenantStore.js";

export const runtime = "nodejs";

export async function GET(request, context) {
  const { slug } = await context.params;
  // Tolerate lookup failures the same way the page's generateMetadata does:
  // a manifest that 500s makes Chrome consider the page uninstallable, so a
  // transient DB error would silently disable "바로가기 추가" entirely.
  const tenant = await getTenantBySlug(slug).catch(() => null);
  const orgName = tenant?.orgName || slug;

  const manifest = {
    // A stable identity keeps Chrome treating every deploy as the same
    // installed app, and lets getInstalledRelatedApps() (via
    // related_applications below) tell "already installed" apart from
    // "browser never offered an install prompt" in the planner UI.
    id: `/s/${encodeURIComponent(slug)}`,
    name: `${orgName} 월별 행사계획`,
    short_name: orgName,
    description: `${orgName} 월별 행사계획 바로가기`,
    start_url: `/s/${encodeURIComponent(slug)}`,
    scope: `/s/${encodeURIComponent(slug)}`,
    related_applications: [{ platform: "webapp", url: new URL(request.url).href }],
    display: "standalone",
    background_color: "#f6f8fb",
    theme_color: "#1d6f8f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
