#!/usr/bin/env node
/**
 * Decide which end-to-end tier a change needs, from the change itself.
 *
 * The smoke tier costs about a minute and the full tier costs several, because
 * the full tier trains a real network on a CPU. Running the expensive one on
 * every change wastes minutes on a typo in a README; running it on none means
 * a protocol change ships untested. So the diff picks.
 *
 * The rules are deliberately **conservative by default**: anything that can
 * reach the application or the suite selects the full tier unless it is on an
 * explicit list of files that cannot. An earlier version inverted this --
 * listing what needed the full tier -- and the omissions were exactly the
 * dangerous ones: a change to a full-tier spec, to the fixture every spec
 * shares, or to this file itself all selected a cheaper tier than the change
 * deserved. A rule that has to enumerate every risky path will always be one
 * path behind.
 *
 * Reads changed paths on stdin (one per line, as `git diff --name-only`
 * produces) and writes `tier=<none|smoke|full>` plus the matching booleans to
 * `$GITHUB_OUTPUT`, or to stdout when running locally.
 *
 *   git diff --name-only origin/main... | node scripts/select_e2e_tier.mjs
 */

import { appendFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Paths that cannot change what the application does: prose, store pages, and
 * images. Checked first, so `tests/e2e/README.md` costs nothing even though
 * everything else under `tests/e2e/` is treated as load-bearing.
 */
const NO_TESTS = [
  /\.md$/,
  /^marketing\//,
  /^images\//,
  /^public\/.*\.(png|jpe?g|svg|ico|webp)$/,
  /^LICENSE$/,
  /^NOTICE/,
  /^\.gitignore$/,
  /^\.github\/(?!workflows\/(ci|electron-e2e)\.yml)/,
];

/**
 * Presentational surfaces the smoke tier covers on its own. Everything here
 * renders but drives no workflow, so a break shows up as soon as the app
 * loads. Keep this list short and specific; when in doubt leave a path off it
 * and let it fall through to the full tier.
 */
const SMOKE_ONLY = [
  /^src\/styles/,
  /^src\/i18n\/locales\//,
  /^src\/components\/chartColors\.ts$/,
  /^public\//,
];

/**
 * Everything that can reach the application under test, the suite, or the
 * machinery that runs it. This is intentionally broad.
 */
const TOUCHES_APP = [
  /^src\//,
  /^tests\/e2e\//,
  /^desktop\//,
  /^protocol\//,
  /^index\.html$/,
  /^playwright\.config\.ts$/,
  /^package(-lock)?\.json$/,
  /^tsconfig.*\.json$/,
  /^vite\.config\.ts$/,
  // The suite's own tooling: the tier selector, the server runner, and the
  // backend provisioner. A change here can silently change what runs.
  /^scripts\/(select_e2e_tier|run_e2e_server|sync_backend_pins)/,
  /^scripts\/(provision_e2e_backend|e2e_backend_pins|e2e_backend_stamp)/,
  /^\.github\/workflows\/(ci|electron-e2e)\.yml$/,
];

/** What one changed path calls for on its own. */
function classify(file) {
  if (NO_TESTS.some((rule) => rule.test(file))) return "none";
  if (SMOKE_ONLY.some((rule) => rule.test(file))) return "smoke";
  if (TOUCHES_APP.some((rule) => rule.test(file))) return "full";
  return "none";
}

/** Return the tier a set of changed paths calls for: the most expensive one. */
export function selectTier(paths) {
  let tier = "none";
  for (const file of paths) {
    const needed = classify(file);
    if (needed === "full") return "full";
    if (needed === "smoke") tier = "smoke";
  }
  return tier;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => resolve(text));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const paths = (await readStdin())
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const tier = selectTier(paths);

  // "full" implies "smoke": the full project already depends on it, so a
  // consumer only has to ask whether to run the expensive one.
  const lines = [
    `tier=${tier}`,
    `smoke=${tier !== "none"}`,
    `full=${tier === "full"}`,
  ];
  console.log(`${paths.length} changed path(s) -> ${tier}`);

  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `${lines.join("\n")}\n`);
  else console.log(lines.join("\n"));
}

// Only read stdin when invoked directly, so the rules can be unit-tested.
const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`select_e2e_tier: ${error.message}`);
    process.exit(2);
  });
}
