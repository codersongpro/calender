import SchoolAdminApp from "../../../../components/SchoolAdminApp.jsx";

export default async function SchoolAdminPage({ params }) {
  const { slug } = await params;
  return <SchoolAdminApp slug={slug} />;
}
