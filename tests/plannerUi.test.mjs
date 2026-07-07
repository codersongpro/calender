import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("event dialog uses date range fields and native time input", async () => {
  const source = await readFile(new URL("../src/components/PlannerApp.jsx", import.meta.url), "utf8");

  assert.match(source, /<span>시작일<\/span>/);
  assert.match(source, /<span>종료일\(선택\)<\/span>/);
  assert.match(source, /type="time"/);
  assert.match(source, /step="60"/);
  assert.match(source, /endDate: draft\.endDate \|\| date/);
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
