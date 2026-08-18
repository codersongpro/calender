import { fail, ok, requireTenantSession } from "../../../../../lib/api.js";
import { listEvents } from "../../../../../lib/sheetsDb.js";

export const runtime = "nodejs";

const MAX_RESULTS = 50;

export async function GET(request, context) {
  try {
    const { slug } = await context.params;
    const { tenant } = await requireTenantSession(request, slug, "view");
    const query = String(request.nextUrl.searchParams.get("q") || "").trim();
    if (!query) return ok({ query, results: [] });

    const needle = query.toLowerCase();
    const events = await listEvents(tenant);
    const results = events
      .filter((event) => !event.deletedAt && eventMatches(event, needle))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, MAX_RESULTS)
      .map((event) => ({ ...event, ...schoolYearFor(event.date) }));

    return ok({ query, results });
  } catch (error) {
    return fail(error);
  }
}

function eventMatches(event, needle) {
  return [event.title, event.place, event.owner, event.category, event.memo].some((field) =>
    String(field ?? "").toLowerCase().includes(needle),
  );
}

// School year runs March-February, so an event's month alone doesn't say
// which school year it belongs to - January/February events belong to the
// school year that started the previous calendar year.
function schoolYearFor(dateKey) {
  const [year, month] = String(dateKey).split("-").map(Number);
  return { year, month, schoolYear: month >= 3 ? year : year - 1 };
}
