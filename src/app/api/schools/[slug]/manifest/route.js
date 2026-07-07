import { NextResponse } from "next/server";

import { getTenantBySlug } from "../../../../../lib/tenantStore.js";

export const runtime = "nodejs";

export async function GET(request, context) {
  const { slug } = await context.params;
  const tenant = await getTenantBySlug(slug);
  const orgName = tenant?.orgName || slug;

  const manifest = {
    name: `${orgName} 월별 행사계획`,
    short_name: orgName,
    description: `${orgName} 월별 행사계획 바로가기`,
    start_url: `/s/${encodeURIComponent(slug)}`,
    scope: `/s/${encodeURIComponent(slug)}`,
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
