#!/usr/bin/env node
/**
 * Decide which end-to-end tier a change needs, from the change itself.
 *
 * The smoke tier costs about a minute and the full tier costs several, because
 * the full tier trains a real network on a CPU. Running the expensive one on
 * every change wastes minutes on a typo in a README; running it on none means
 * a protocol change ships untested. So the diff picks.
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
 * Changes that can break the client/server contract or the desktop shell, and
 * that the smoke tier alone would not catch. A protocol schema, the pinned
 * engine, the training or pipeline paths, or the Electron main process all
 * need a run that actually trains, saves, loads, and infers.
 */
const NEEDS_FULL = [
  /^protocol\//,
  /^tests\/e2e\/backend-pins\.json$/,
  /^desktop\//,
  /^src\/protocol\//,
  /^src\/useWebSocket\.ts$/,
  /^src\/useTraining\.ts$/,
  /^src\/usePipeline\.ts$/,
  /^src\/modelLoad\.ts$/,
  /^src\/hooks\/useServerBootstrap\.ts$/,
  /^src\/hooks\/useModelActions\.ts$/,
  /^src\/components\/pipelineInput\.ts$/,
  /^scripts\/(provision_e2e_backend|e2e_backend_pins)\./,
];

/** Anything else that can change what the browser renders or how it is built. */
const NEEDS_SMOKE = [
  /^src\//,
  /^index\.html$/,
  /^public\//,
  /^tests\/e2e\//,
  /^playwright\.config\.ts$/,
  /^package(-lock)?\.json$/,
  /^tsconfig\.json$/,
  /^vite\.config\.ts$/,
  /^scripts\/run_e2e_server\.mjs$/,
  /^\.github\/workflows\/ci\.yml$/,
];

/** Return the tier a set of changed paths calls for. */
export function selectTier(paths) {
  if (paths.some((file) => NEEDS_FULL.some((rule) => rule.test(file)))) {
    return "full";
  }
  if (paths.some((file) => NEEDS_SMOKE.some((rule) => rule.test(file)))) {
    return "smoke";
  }
  return "none";
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
