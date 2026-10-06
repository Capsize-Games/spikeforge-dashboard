#!/usr/bin/env node
/**
 * Keep the engine commit the desktop app builds from tied to a real release.
 *
 * `desktop-release.yml` checks the engine out at a bare commit SHA. Nothing
 * connected that SHA to anything, and it drifted: the desktop app shipped from
 * a commit that was not on the engine's `main` at all, left behind when that
 * history was rewritten. It still built, because the commit object survives,
 * so nothing ever complained.
 *
 * The SHA is now derived rather than chosen: it is whatever
 * `spikeforge-v<version>` points at, for the `spikeforge` version already
 * pinned in `tests/e2e/backend-pins.json`. That makes one version the
 * authority for both the end-to-end suite and the packaged application.
 *
 * Two modes, matching `sync_backend_pins.mjs`:
 *
 *   node scripts/sync_engine_ref.mjs --check
 *     Exit 1 when the workflow is pinned somewhere else. CI uses this.
 *
 *   node scripts/sync_engine_ref.mjs
 *     Rewrite the workflow.
 *
 * `--sha` supplies the commit directly instead of resolving the tag, which is
 * what the tests use and what an offline run needs.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../tests/e2e/support/env.mjs";

const PINS_PATH = path.join(REPO_ROOT, "tests", "e2e", "backend-pins.json");
const WORKFLOW_PATH = path.join(
  REPO_ROOT,
  ".github",
  "workflows",
  "desktop-release.yml",
);
const ENGINE_REPO = "Capsize-Games/spikeforge";

/**
 * The `ref:` belonging to the engine checkout.
 *
 * Anchored on the repository line above it so it cannot match the `ref:` of
 * some other checkout step added later.
 */
const REF_PATTERN = new RegExp(
  `(repository:\\s*${ENGINE_REPO}\\s*\\n\\s*ref:\\s*)([0-9a-f]{7,40})`,
);

export function parseArgs(argv) {
  const args = { check: false, sha: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") args.check = true;
    else if (argument === "--sha") args.sha = argv[++index];
    else throw new Error(`unknown argument: ${argument}`);
  }
  return args;
}

/** The engine version the end-to-end pins already name. */
export function pinnedVersion(pinsJson) {
  const version = JSON.parse(pinsJson)?.packages?.spikeforge;
  if (!version) throw new Error("backend-pins.json has no spikeforge version");
  return version;
}

/** The engine commit currently written into the release workflow. */
export function currentRef(workflow) {
  const match = REF_PATTERN.exec(workflow);
  if (!match) {
    throw new Error(`no ${ENGINE_REPO} ref found in desktop-release.yml`);
  }
  return match[2];
}

/** The same workflow with the engine checkout moved to `sha`. */
export function withRef(workflow, sha) {
  return workflow.replace(REF_PATTERN, `$1${sha}`);
}

/** Resolve `spikeforge-v<version>` to the commit it points at. */
async function resolveTag(version) {
  const tag = `spikeforge-v${version}`;
  const url = `https://api.github.com/repos/${ENGINE_REPO}/commits/${tag}`;
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GH_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `cannot resolve ${tag}: ${response.status} ${response.statusText}`,
    );
  }
  const { sha } = await response.json();
  if (!sha) throw new Error(`${tag} resolved to no commit`);
  return sha;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");
  const version = pinnedVersion(readFileSync(PINS_PATH, "utf8"));
  const wanted = args.sha ?? (await resolveTag(version));
  const current = currentRef(workflow);

  if (current === wanted) {
    console.log(`desktop-release.yml is pinned to spikeforge-v${version}`);
    return;
  }
  if (args.check) {
    console.error(
      `desktop-release.yml builds the engine at ${current}, but ` +
        `spikeforge-v${version} is ${wanted}.\n` +
        "Run: node scripts/sync_engine_ref.mjs",
    );
    process.exit(1);
  }
  writeFileSync(WORKFLOW_PATH, withRef(workflow, wanted));
  console.log(`pinned the engine to ${wanted} (spikeforge-v${version})`);
}

// Importing this file for its helpers must not run the synchronisation.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
