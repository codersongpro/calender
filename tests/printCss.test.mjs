import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("print layout uses A4 paper height instead of viewport height", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const printCss = css.slice(css.indexOf("@media print"));

  assert.match(printCss, /@page\s*{[^}]*size:\s*A4 portrait;/s);
  assert.match(printCss, /--print-page-height:\s*287mm;/);
  assert.doesNotMatch(printCss, /--print-page-height:\s*100vh;/);
});

test("print table rows clamp overflowing content so every date row can fit", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const printCss = css.slice(css.indexOf("@media print"));

  assert.match(printCss, /\.print-row-blank,[\s\S]*?\.print-row-blank td\s*{[^}]*max-height:/);
  assert.match(printCss, /\.print-row-normal,[\s\S]*?\.print-row-normal td\s*{[^}]*max-height:/);
  assert.match(printCss, /\.print-row-holiday,[\s\S]*?\.print-row-holiday td\s*{[^}]*max-height:/);
  assert.match(printCss, /\.event-title\s*{[^}]*white-space:\s*nowrap;/s);
  assert.match(printCss, /\.holiday-line\s*{[^}]*white-space:\s*nowrap;/s);
});

test("print font size fills each row's height instead of a flat fraction of it", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const printCss = css.slice(css.indexOf("@media print"));

  // The row-unit height minus a fixed cell padding/border overhead, divided
  // by line-height - not an arbitrary shrink factor - is what lets normal
  // rows use nearly all of their allotted height instead of leaving most of
  // it as blank padding.
  assert.match(
    printCss,
    /--print-font-size:\s*clamp\(6px,\s*calc\(\(var\(--print-row-unit\)\s*-\s*0\.5mm\s*-\s*2px\)\s*\/\s*1\.05\),\s*20px\);/,
  );
  assert.match(printCss, /\.planner-table\s*{[^}]*font-size:\s*var\(--print-font-size\);/s);
  assert.match(printCss, /\.category-pill\s*{[^}]*font-size:\s*inherit;/s);
  assert.doesNotMatch(printCss, /\.planner-table\s*{[^}]*font-size:\s*7\.5px;/s);
});

test("blank print rows are weighted below a normal row so empty days don't eat readable space", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const printCss = css.slice(css.indexOf("@media print"));

  assert.match(printCss, /\.print-row-blank[\s\S]*?height:\s*calc\(var\(--print-row-unit\)\s*\*\s*0\.5\);/);
  assert.match(printCss, /\.print-row-holiday[\s\S]*?height:\s*calc\(var\(--print-row-unit\)\s*\*\s*2\);/);
});

test("blank rows get their own smaller font instead of reusing the full row's font size", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const printCss = css.slice(css.indexOf("@media print"));

  // A table cell's height is only a minimum in real layout, so a blank row
  // that's half a normal row's height must also use a font sized to that
  // half-height - reusing --print-font-size would just force the row back
  // to full height regardless of the height/max-height above.
  assert.match(
    printCss,
    /--print-font-size-blank:\s*clamp\(6px,\s*calc\(\(var\(--print-row-unit\)\s*\*\s*0\.5\s*-\s*0\.5mm\s*-\s*2px\)\s*\/\s*1\.05\),\s*14px\);/,
  );
  assert.match(printCss, /\.print-row-blank[\s\S]*?font-size:\s*var\(--print-font-size-blank\);/);
});

test("print title occupies exactly its budgeted height so it can't push the last row off the page", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const printCss = css.slice(css.indexOf("@media print"));

  // The row-height math subtracts --print-title-height from the page; if the
  // title's real height can exceed that budget (e.g. the h2's browser-default
  // ~20px margins, which caused the original "31일 잘림" bug), the whole table
  // shifts down and the last day's row is clipped by overflow: hidden.
  assert.match(printCss, /\.print-title\s*{[^}]*height:\s*var\(--print-title-height\);/s);
  assert.match(printCss, /\.print-title\s*{[^}]*max-height:\s*var\(--print-title-height\);/s);
  assert.match(printCss, /\.print-title\s*{[^}]*overflow:\s*hidden;/s);
  assert.match(printCss, /\.print-title h2\s*{[^}]*margin:\s*0;/s);
  assert.match(printCss, /\.print-title p\s*{[^}]*margin:\s*0;/s);
});

test("print title is enlarged and no cell text is ever ellipsis-truncated", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const printCss = css.slice(css.indexOf("@media print"));

  assert.match(printCss, /\.print-title h2\s*{[^}]*font-size:\s*22px;/s);
  assert.match(printCss, /\.print-title p\s*{[^}]*font-size:\s*13px;/s);

  // Wrapping is disallowed and cells must never fall back to "...";
  // shrinkPrintRowsToFit() in PlannerApp.jsx handles overflow by shrinking
  // a row's own font-size instead, so the CSS itself must never truncate.
  assert.doesNotMatch(printCss, /text-overflow:\s*ellipsis/);
  assert.match(printCss, /\.planner-table th,\s*\n\s*\.planner-table td\s*{[^}]*white-space:\s*nowrap;/s);
  assert.match(printCss, /\.date-cell \.date-button,\s*\n\s*\.title-cell \.event-title\s*{[^}]*white-space:\s*nowrap;/s);
});
