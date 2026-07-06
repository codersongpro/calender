import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("event dialog uses date range fields and native time input", async () => {
  const source = await readFile(new URL("../src/components/PlannerApp.jsx", import.meta.url), "utf8");

  assert.match(source, /<span>시작일<\/span>/);
  assert.match(source, /<span>종료일\(선택\)<\/span>/);
  assert.match(source, /type="time"/);
  assert.match(source, /step="60"/);
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
