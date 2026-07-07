import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("event dialog uses date range fields and 24-hour time controls", async () => {
  const source = await readFile(new URL("../src/components/PlannerApp.jsx", import.meta.url), "utf8");

  assert.match(source, /<span>시작일<\/span>/);
  assert.match(source, /<span>종료일\(선택\)<\/span>/);
  assert.match(source, /function TimeInput\(/);
  assert.match(source, /inputMode="numeric"/);
  assert.match(source, /stepClock\(value, 10\)/);
  assert.match(source, /stepClock\(value, -10\)/);
  assert.match(source, /normalizeClock\(event\.target\.value\)/);
  assert.match(source, /endDate: draft\.endDate \|\| date/);
  assert.doesNotMatch(source, /type="time"/);
  assert.doesNotMatch(source, /time-option-list/);
  assert.doesNotMatch(source, /getTimeOptions/);
});

test("planner can move to previous and next school years", async () => {
  const source = await readFile(new URL("../src/components/PlannerApp.jsx", import.meta.url), "utf8");

  assert.match(source, /function changeSchoolYear\(amount\)/);
  assert.match(source, /changeSchoolYear\(-1\)/);
  assert.match(source, /changeSchoolYear\(1\)/);
  assert.doesNotMatch(source, /min="2000"/);
  assert.doesNotMatch(source, /max="2100"/);
});

test("planner month dropdown has local options before month data loads", async () => {
  const source = await readFile(new URL("../src/components/PlannerApp.jsx", import.meta.url), "utf8");

  assert.match(source, /getMonthOptions/);
  assert.match(source, /monthData\?\.monthOptions\?\.length \? monthData\.monthOptions : getMonthOptions\(schoolYear\)/);
  assert.match(source, /monthOptions\.map/);
});

test("school admin can clear monthly or school-year events only through admin route", async () => {
  const adminSource = await readFile(new URL("../src/components/SchoolAdminApp.jsx", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("../src/app/api/schools/[slug]/events/clear/route.js", import.meta.url), "utf8");

  assert.match(adminSource, /월별 행사 클리어/);
  assert.match(adminSource, /학년도 행사 클리어/);
  assert.match(adminSource, /endDate: holiday\.endDate \|\| date/);
  assert.match(routeSource, /requireTenantSession\(request, slug, "admin"\)/);
});

test("school admin status is shown above the management forms", async () => {
  const source = await readFile(new URL("../src/components/SchoolAdminApp.jsx", import.meta.url), "utf8");

  assert.ok(source.lastIndexOf("<StatusBar status={status} error={error} />") < source.indexOf('<section className="admin-layout">'));
});

test("school admin status remains visible while managing uploads", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.admin-page > \.status\s*{[^}]*position:\s*sticky;[^}]*top:\s*0;/s);
});

test("month data route reads fresh sheet data so uploads appear immediately", async () => {
  const source = await readFile(new URL("../src/app/api/schools/[slug]/month/route.js", import.meta.url), "utf8");

  assert.match(source, /getMonthData\(tenant,\s*{ year: monthOption\.year, month: monthOption\.month },\s*{ cacheTtlMs: 0 }\)/);
});

test("print pdf keeps table title and weekend shading", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

  assert.match(css, /@media print\s*{[\s\S]*\.print-title\s*{[^}]*display:\s*flex;/);
  assert.match(css, /@media print\s*{[\s\S]*\.planner-table th,\s*\.saturday-row td,\s*\.sunday-row td,\s*\.holiday-row td\s*{[^}]*-webkit-print-color-adjust:\s*exact;[^}]*print-color-adjust:\s*exact;/);
});
