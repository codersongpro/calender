import { getTenantBySlug } from "../../../lib/tenantStore.js";
import PlannerApp from "../../../components/PlannerApp.jsx";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug).catch(() => null);
  const orgName = tenant?.orgName || "월별 행사계획";

  return {
    title: orgName,
    // Rendered into the initial HTML (rather than injected client-side)
    // so the browser can evaluate PWA installability on first load, which
    // is what makes the "바로가기 추가" button's native install prompt fire
    // reliably instead of only after client-side hydration.
    manifest: `/api/schools/${encodeURIComponent(slug)}/manifest`,
    icons: {
      icon: [
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: orgName,
    },
  };
}

export async function generateViewport() {
  return {
    // A custom viewport export replaces Next's default meta tag entirely
    // rather than merging into it, so width/initialScale have to be repeated
    // here - otherwise this page (the only route with a custom viewport,
    // for themeColor) silently loses width=device-width, initial-scale=1.
    // Without it mobile browsers render the dense planner table at desktop
    // width and scale it down, which leaves native double-tap-to-zoom active
    // and makes a double-tap on a date button trigger a jarring full-page
    // zoom instead of two ordinary clicks.
    width: "device-width",
    initialScale: 1,
    themeColor: "#1d6f8f",
  };
}

export default async function SchoolPage({ params }) {
  const { slug } = await params;
  return <PlannerApp slug={slug} />;
}
