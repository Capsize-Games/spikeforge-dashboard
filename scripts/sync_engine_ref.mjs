#!/usr/bin/env node
/**
 * Keep the engine commit the desktop app builds from tied to a real release.
 *
 * `tests/e2e/backend-pins.json` carries the commit in `engine_commit`, and
 * `desktop-release.yml` reads it at runtime. Nothing connected the old
 * workflow-embedded SHA to anything, and it drifted: the desktop app shipped
 * from a commit that was not on the engine's `main` at all, left behind when
 * that history was rewritten. It still built, because the commit object
 * survives, so nothing ever complained.
 *
 * The SHA is now derived rather than chosen: it is whatever
 * `spikeforge-v<version>` points at, for the `spikeforge` version already
 * pinned in `tests/e2e/backend-pins.json`. That makes one version the
 * authority for both the end-to-end suite and the packaged application.
 *
 * The commit lives in the pins file rather than in the workflow so the
 * nightly sync never creates or updates a workflow file. Pushing one needs
 * the `workflows` permission, which the automation token does not have.
 *
 * Two modes, matching `sync_backend_pins.mjs`:
 *
 *   node scripts/sync_engine_ref.mjs --check
 *     Exit 1 when the pins name a stale commit. CI uses this.
 *
 *   node scripts/sync_engine_ref.mjs
 *     Rewrite the pins file.
 *
 * `--sha` supplies the commit directly instead of resolving the tag, which is
 * what the tests use and what an offline run needs.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../tests/e2e/support/env.mjs";

const PINS_PATH = path.join(REPO_ROOT, "tests", "e2e", "backend-pins.json");
const ENGINE_REPO = "Capsize-Games/spikeforge";

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

/** The engine commit the pins already name, or null when absent. */
export function engineCommit(pinsJson) {
  const commit = JSON.parse(pinsJson)?.engine_commit;
  if (commit === undefined || commit === null) return null;
  if (typeof commit !== "string") {
    throw new Error("backend-pins.json has an invalid engine_commit");
  }
  return commit;
}

/** The same pins with the engine commit moved to `sha`. */
export function withEngineCommit(pinsJson, sha) {
  const pins = JSON.parse(pinsJson);
  return `${JSON.stringify({ ...pins, engine_commit: sha }, null, 2)}\n`;
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
  const text = readFileSync(PINS_PATH, "utf8");
  const version = pinnedVersion(text);
  const wanted = args.sha ?? (await resolveTag(version));
  const current = engineCommit(text);

  if (current === wanted) {
    console.log(`backend-pins.json is pinned to spikeforge-v${version}`);
    return;
  }
  if (args.check) {
    console.error(
      `backend-pins.json names spikeforge-v${version} at ${current}, ` +
        `but the tag is ${wanted}.\n` +
        "Run: node scripts/sync_engine_ref.mjs",
    );
    process.exit(1);
  }
  writeFileSync(PINS_PATH, withEngineCommit(text, wanted));
  console.log(`pinned the engine to ${wanted} (spikeforge-v${version})`);
}

// Importing this file for its helpers must not run the synchronisation.
const invokedDirectly = process.argv[1] !== undefined &&
  import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
