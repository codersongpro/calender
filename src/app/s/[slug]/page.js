import PlannerApp from "../../../components/PlannerApp.jsx";

export default async function SchoolPage({ params }) {
  const { slug } = await params;
  return <PlannerApp slug={slug} />;
}
