#!/usr/bin/env node
/**
 * Keep `tests/e2e/backend-pins.json` in step with the engine's own manifest.
 *
 * The end-to-end suite runs against a release combination of the five
 * SpikeForge distributions. The authority for that combination is
 * `compatibility.json` in `Capsize-Games/spikeforge`, whose last entry is the
 * newest supported set. Copying it by hand is the kind of step that gets
 * skipped, and a skipped one means the suite quietly keeps testing an engine
 * nobody ships any more.
 *
 * Two modes:
 *
 *   node scripts/sync_backend_pins.mjs --check
 *     Exit 1 when the pins are behind, printing the difference. CI uses this.
 *
 *   node scripts/sync_backend_pins.mjs
 *     Rewrite the pins file. The scheduled workflow uses this and opens a pull
 *     request when the file changes.
 *
 * `--source` accepts a URL or a local path, so a checkout can be used offline.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../tests/e2e/support/env.mjs";

const PINS_PATH = path.join(REPO_ROOT, "tests", "e2e", "backend-pins.json");

const DEFAULT_SOURCE =
  "https://raw.githubusercontent.com/Capsize-Games/spikeforge/main/" +
  "compatibility.json";

/** Distributions the suite installs, in the order the pins file lists them. */
const TRACKED = [
  "spikeforge",
  "spikeforge-targets",
  "spikeforge-hub",
  "spikeforge-serve",
  "spikeforge-server",
];

function parseArgs(argv) {
  const args = { check: false, source: DEFAULT_SOURCE };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") args.check = true;
    else if (argument === "--source") args.source = argv[++index];
    else throw new Error(`unknown argument: ${argument}`);
  }
  return args;
}

/** Read the engine's compatibility manifest from a URL or a local path. */
async function readManifest(source) {
  if (!/^https?:\/\//.test(source)) {
    return JSON.parse(readFileSync(source, "utf8"));
  }
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`${source} returned ${response.status}`);
  }
  return response.json();
}

/**
 * Return the newest release combination the manifest declares.
 *
 * `releases` is append-only and ordered oldest to newest, so the last entry is
 * the current one. An empty list means the manifest is malformed, not that
 * there is nothing to pin.
 */
function newestRelease(manifest) {
  const releases = manifest.releases;
  if (!Array.isArray(releases) || releases.length === 0) {
    throw new Error("compatibility.json declares no releases");
  }
  return releases[releases.length - 1];
}

/** Build the packages block the pins file records, in a stable order. */
function packagesFrom(release) {
  const packages = {};
  for (const name of TRACKED) {
    const version = release[name];
    if (typeof version !== "string") {
      throw new Error(`compatibility.json has no version for ${name}`);
    }
    packages[name] = version;
  }
  return packages;
}

/** Describe every version that differs, for a readable failure. */
function differences(current, wanted) {
  const changes = [];
  for (const [name, version] of Object.entries(wanted.packages)) {
    const was = current.packages?.[name];
    if (was !== version) changes.push(`${name}: ${was ?? "absent"} -> ${version}`);
  }
  if (current.protocol_version !== wanted.protocol_version) {
    changes.push(
      `protocol_version: ${current.protocol_version} -> ` +
        `${wanted.protocol_version}`,
    );
  }
  return changes;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const current = JSON.parse(readFileSync(PINS_PATH, "utf8"));
  const manifest = await readManifest(args.source);
  const release = newestRelease(manifest);

  // Everything except the tracked versions is this repository's own choice --
  // the wheel index, the extras, the explanatory comment -- so it is carried
  // over rather than regenerated.
  const wanted = {
    ...current,
    protocol_version: String(manifest.protocol_version),
    packages: packagesFrom(release),
  };

  const changes = differences(current, wanted);
  if (changes.length === 0) {
    console.log("backend pins are current");
    return 0;
  }

  console.log("backend pins are behind the engine manifest:");
  for (const change of changes) console.log(`  ${change}`);

  if (args.check) {
    console.log(
      "\nRun `npm run e2e:pins:sync` to update them, then re-provision " +
        "with `npm run e2e:backend`.",
    );
    return 1;
  }

  writeFileSync(PINS_PATH, `${JSON.stringify(wanted, null, 2)}\n`);
  console.log(`\nupdated ${path.relative(REPO_ROOT, PINS_PATH)}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`sync_backend_pins: ${error.message}`);
    process.exit(2);
  },
);
