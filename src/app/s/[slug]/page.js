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
    themeColor: "#1d6f8f",
  };
}

export default async function SchoolPage({ params }) {
  const { slug } = await params;
  return <PlannerApp slug={slug} />;
}
