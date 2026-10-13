/**
 * Every desktop runtime file must ship in the packaged application.
 *
 * `electron-builder.yml` lists packaged files explicitly, so a new
 * `desktop/` module that no entry covers is silently absent from the
 * release: the packaged main process crashes on `require` before it
 * writes a log, and the release's launch check fails with no window.
 * This resolves the runtime require graph plus the window preload and
 * asserts each target is listed. Test files are excluded by design.
 *
 * Run with `npm run scripts:test`.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const source = dirname(dirname(fileURLToPath(import.meta.url)));

function packagedFiles() {
  const config = readFileSync(join(source, "electron-builder.yml"), "utf8");
  const lines = config.split("\n");
  const start = lines.findIndex((line) => line === "files:");
  assert.notEqual(start, -1, "electron-builder.yml must list files");
  const listed = new Set();
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("  - ")) listed.add(line.slice("  - ".length));
    else if (line === "" || line.startsWith("  #")) continue;
    else break;
  }
  assert.ok(listed.size > 0, "the files list must not be empty");
  return listed;
}

function runtimeModules() {
  const modules = [];
  for (const dir of ["desktop", "desktop/auth"]) {
    for (const name of readdirSync(join(source, dir))) {
      if (!name.endsWith(".cjs")) continue;
      if (name.endsWith(".test.cjs")) continue;
      if (name.includes("test_support")) continue;
      modules.push(join(dir, name));
    }
  }
  return modules;
}

/** Relative targets a runtime module loads: requires and the preload. */
function localTargets(module) {
  const text = readFileSync(join(source, module), "utf8");
  const targets = [];
  for (const match of text.matchAll(/require\("(\.[./][^"]*)"\)/g)) {
    targets.push(normalize(join(dirname(module), match[1])));
  }
  for (const match of text.matchAll(/__dirname, "([^"]+\.cjs)"\)/g)) {
    targets.push(normalize(join(dirname(module), match[1])));
  }
  return targets;
}

test("the packaged file list covers the desktop runtime graph", () => {
  const listed = packagedFiles();
  const missing = [];
  for (const module of runtimeModules()) {
    assert.ok(
      listed.has(module),
      `${module} runs in the packaged app but is not listed`,
    );
    for (const target of localTargets(module)) {
      if (!listed.has(target)) missing.push(`${module} -> ${target}`);
    }
  }
  assert.deepEqual(missing, [], "packaged app would miss required files");
});
