import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const plannerSource = () => readFile(new URL("../src/components/PlannerApp.jsx", import.meta.url), "utf8");
const globalsCss = () => readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("the fit-to-page print mode keeps its own column percentages", async () => {
  const css = await globalsCss();
  const printCss = css.slice(css.indexOf("@media print"));

  // "화면 비율 그대로" was added as a SECOND mode; the original fit-to-page
  // sheet has to keep printing exactly as it always did, which these
  // percentages (and not the screen's px widths) are what define.
  assert.match(printCss, /\.planner-table th:nth-child\(1\),\s*\n\s*\.planner-table th:nth-child\(2\)\s*{\s*width:\s*5%;/);
  assert.match(printCss, /\.planner-table th:nth-child\(3\)\s*{\s*width:\s*9%;/);
  assert.match(printCss, /\.planner-table th:nth-child\(4\)\s*{\s*width:\s*13%;/);
  assert.match(printCss, /\.planner-table th:nth-child\(6\)\s*{\s*width:\s*18%;/);
  assert.match(printCss, /\.planner-table th:nth-child\(7\)\s*{\s*width:\s*16%;/);
});

test("screen-ratio print scales with zoom so the sheet paginates", async () => {
  const source = await plannerSource();

  // transform doesn't change layout, so the browser would still paginate
  // against the unscaled height and tear the table at the wrong rows; zoom
  // scales the boxes themselves, so page breaks land where they look like
  // they should.
  assert.match(source, /zoom:\s*String\(scale\)/);
  assert.doesNotMatch(source, /transform:\s*`scale\(\$\{scale\}\)`/);

  // Width is what's matched to the paper; the height then follows at the same
  // scale, which is what keeps the printed table's proportions identical to
  // the screen's instead of stretching it to fill the sheet.
  assert.match(source, /const scale = printableWidth \/ tableWidth;/);
  assert.match(source, /\(paper\.widthMm - PRINT_MARGIN_MM \* 2\) \* CSS_PX_PER_MM/);
});

test("screen-ratio print must be captured before print styles take over", async () => {
  const source = await plannerSource();

  // The whole mode depends on measuring the SCREEN layout. printPlanner runs
  // before window.print(), and beforeprint fires against screen styles too -
  // but matchMedia('print') fires after the switch, so measuring there would
  // read the print rules back and defeat the entire feature.
  assert.match(source, /if \(printMode === "screen"\) applyScreenRatioPrintLayout\(paperSize\);\s*\n\s*window\.print\(\);/);
  assert.match(source, /function handleBeforePrint\(\)[\s\S]*?applyScreenRatioPrintLayout\(paperSizeRef\.current\)/);
  assert.match(
    source,
    /function handlePrintMediaChange\(event\)[\s\S]*?if \(printModeRef\.current === "screen"\) return;/,
  );

  // Applying twice would measure the already-zoomed table and square the scale.
  assert.match(source, /if \(screenRatioRestore\.length\) return true;/);
});

test("screen-ratio print restores the page exactly as it found it", async () => {
  const source = await plannerSource();

  // Inline !important is what lets the frozen screen values beat the print
  // stylesheet, so they must be removed again or the SCREEN view would stay
  // frozen at print-time widths after the dialog closes.
  assert.match(source, /element\.style\.setProperty\(property, value, "important"\)/);
  assert.match(source, /screenRatioRestore\.push\(\[element, element\.getAttribute\("style"\)\]\)/);
  assert.match(source, /if \(previousStyle === null\) element\.removeAttribute\("style"\);/);
  assert.match(source, /else element\.setAttribute\("style", previousStyle\);/);
  assert.match(source, /function handleAfterPrint\(\)[\s\S]*?clearScreenRatioPrintLayout\(\)/);
});

test("screen-ratio print leaves row page-breaks and free-text wrapping to the stylesheet", async () => {
  const source = await plannerSource();
  const frozen = source.slice(
    source.indexOf("const SCREEN_RATIO_FROZEN_PROPERTIES"),
    source.indexOf("let screenRatioRestore"),
  );

  // Freezing break-inside off the screen (where it is "auto") would let a row
  // be split in half across two sheets; the print rule must survive.
  assert.doesNotMatch(frozen, /"break-inside"/);
  assert.doesNotMatch(frozen, /"page-break-inside"/);

  // Only short fixed labels are pinned to one line. 일정 제목/장소/담당자 must
  // not be, or the sheet would stop matching what the screen shows.
  const nowrap = frozen.slice(frozen.indexOf("const SCREEN_RATIO_NOWRAP_SELECTOR"));
  assert.match(nowrap, /\.category-pill/);
  assert.match(nowrap, /\.print-title p/);
  assert.doesNotMatch(nowrap, /\.title-cell/);
  assert.doesNotMatch(nowrap, /tbody td/);
});

test("screen-ratio print keeps the whole month in one flowing table", async () => {
  const source = await plannerSource();

  // Splitting into N fixed sheets is a fit-to-page concept - here the sheet
  // count falls out of the table's natural height instead.
  assert.match(source, /splitDaysForPrint\(filteredDays, printMode === "screen" \? 1 : printPages\)/);
  assert.match(source, /disabled=\{printMode === "screen"\}/);
});

test("both print modes are offered to the user", async () => {
  const source = await plannerSource();

  assert.match(source, /<option value="fit">용지에 맞추기<\/option>/);
  assert.match(source, /<option value="screen">화면 비율 그대로<\/option>/);
  // Defaults to the long-standing behaviour so existing users see no change.
  assert.match(source, /useState\("fit"\)/);
});
