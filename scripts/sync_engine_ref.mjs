#!/usr/bin/env node
/**
 * Keep the engine commit the desktop app builds from tied to a real release.
 *
 * `desktop-release.yml` used to check the engine out at a bare commit SHA
 * written into the workflow file itself. Nothing connected that SHA to
 * anything, and it drifted: the desktop app shipped from a commit that was
 * not on the engine's `main` at all, left behind when that history was
 * rewritten. It still built, because the commit object survives, so nothing
 * ever complained.
 *
 * The SHA is derived rather than chosen: it is whatever
 * `spikeforge-v<version>` points at, for the `spikeforge` version already
 * pinned in `tests/e2e/backend-pins.json`. That makes one version the
 * authority for both the end-to-end suite and the packaged application.
 *
 * The commit lives in the pins file, not in the workflow: the release
 * workflow reads `engine_commit` at build time. A bump that rewrote a file
 * under `.github/workflows/` could not be pushed with the built-in token,
 * which can never hold the `workflows` permission, so the nightly sync
 * failed on every run that moved the engine. A data file pushes fine.
 *
 * Two modes, matching `sync_backend_pins.mjs`:
 *
 *   node scripts/sync_engine_ref.mjs --check
 *     Exit 1 when the pins name a different commit. CI uses this.
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

/** The engine commit the pins currently name. */
export function currentCommit(pinsJson) {
  const commit = JSON.parse(pinsJson)?.engine_commit;
  if (typeof commit !== "string" || commit.length === 0) {
    throw new Error("backend-pins.json has no engine_commit");
  }
  return commit;
}

/** The same pins file with the engine commit moved to `sha`. */
export function withCommit(pinsJson, sha) {
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
  const pins = readFileSync(PINS_PATH, "utf8");
  const version = pinnedVersion(pins);
  const wanted = args.sha ?? (await resolveTag(version));
  const current = JSON.parse(pins).engine_commit ?? null;

  if (current === wanted) {
    console.log(`backend-pins.json names spikeforge-v${version}`);
    return;
  }
  if (args.check) {
    console.error(
      `backend-pins.json names engine commit ${current ?? "nothing"}, ` +
        `but spikeforge-v${version} is ${wanted}.\n` +
        "Run: node scripts/sync_engine_ref.mjs",
    );
    process.exit(1);
  }
  writeFileSync(PINS_PATH, withCommit(pins, wanted));
  console.log(`pinned the engine to ${wanted} (spikeforge-v${version})`);
}

// Importing this file for its helpers must not run the synchronisation.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
