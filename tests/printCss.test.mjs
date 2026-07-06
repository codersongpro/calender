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

test("print table cells clamp overflowing content so every date row can fit", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const printCss = css.slice(css.indexOf("@media print"));

  assert.match(printCss, /\.planner-table td\s*{[^}]*max-height:/s);
  assert.match(printCss, /\.event-title\s*{[^}]*white-space:\s*nowrap;/s);
  assert.match(printCss, /\.holiday-line\s*{[^}]*white-space:\s*nowrap;/s);
});
