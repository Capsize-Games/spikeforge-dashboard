/**
 * Count the border lines the stylesheet draws.
 *
 * Issue #20 asks for the number of visible border lines before and after the
 * docked-pane recomposition, so the measurement has to be reproducible rather
 * than eyeballed. A "line" here is one declaration that draws ink on at least
 * one edge: `border`, `border-top`, ... with a non-zero width. Rules that only
 * remove a border (`border: none`) and `border-radius` draw nothing and are
 * not counted.
 *
 * Usage: node scripts/count_borders.mjs [styles-dir]
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2] ?? path.join(root, "src", "styles");

/** The four edge shorthands plus the `border` shorthand itself. */
const EDGE = /^(border|border-(top|right|bottom|left))$/;

/** A declaration draws a line when its width is a non-zero length. */
function drawsLine(value) {
  const width = value.trim().split(/\s+/)[0];
  if (width === "none" || width === "0" || width === "0px") return false;
  return /^[\d.]/.test(width) ? Number.parseFloat(width) > 0 : width !== "";
}

async function main() {
  const files = (await readdir(dir)).filter((name) => name.endsWith(".css"));
  let total = 0;
  const perFile = [];
  for (const file of files.sort()) {
    const css = await readFile(path.join(dir, file), "utf8");
    let count = 0;
    for (const line of css.split("\n")) {
      const match = /^\s*([a-z-]+)\s*:\s*(.+?);\s*$/.exec(line);
      if (!match) continue;
      if (!EDGE.test(match[1])) continue;
      if (drawsLine(match[2])) count += 1;
    }
    total += count;
    if (count > 0) perFile.push(`${file}: ${count}`);
  }
  console.log(perFile.join("\n"));
  console.log(`border lines: ${total}`);
}

await main();
