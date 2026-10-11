/** Run the tagged publication command in a fresh release-job workspace. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const source = dirname(dirname(fileURLToPath(import.meta.url)));
const workflow = readFileSync(join(source,
  ".github/workflows/desktop-release.yml"), "utf8");
const release = workflow.split("\n  release:\n")[1];
assert.ok(release, "the tagged release job must exist");
const marker = "      - name: Publish to itch.io\n";
const publishAt = release.indexOf(marker);
assert.notEqual(publishAt, -1, "the publication step must exist");
const invocation = release.slice(publishAt).split("\n").find((line) =>
  /^\s+bash scripts\/publish_itch\.sh /.test(line))?.trim();
assert.ok(invocation, "the workflow must invoke the actual publish script");
const version = JSON.parse(readFileSync(join(source, "package.json"),
  "utf8")).version;

function command(cwd, program, args, extra = {}) {
  const result = spawnSync(program, args, { cwd, encoding: "utf8", ...extra });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result;
}

function checkout(cwd) {
  // Materialize actual tracked release files; no script or manifest fixtures.
  const archive = command(source, "git", ["archive", "HEAD", "package.json",
    "scripts/publish_itch.sh"], { encoding: null });
  command(cwd, "tar", ["-xf", "-"], { input: archive.stdout });
}

function checkoutFromWorkflow(cwd) {
  const steps = release.slice(0, publishAt).split("\n      - ");
  const step = steps.find((item) => /uses: actions\/checkout@/.test(item));
  if (!step) return;
  assert.doesNotMatch(step, /repository:|ref:/,
    "publication must check out the current tagged dashboard repository");
  const path = step.match(/^\s+path:\s*(.+)$/m)?.[1] ?? ".";
  const destination = join(cwd, path);
  mkdirSync(destination, { recursive: true });
  checkout(destination);
}

// Only Butler's remote API is replaced. Bash, Node and source files are real.
const butler = `#!/usr/bin/env node
import fs from "node:fs";
fs.appendFileSync(process.env.DESKTOP_PUBLISH_LOG,
  JSON.stringify(process.argv.slice(2)) + String.fromCharCode(10));
`;

function workspace(t) {
  const cwd = mkdtempSync(join(tmpdir(), "desktop-release-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const bin = join(cwd, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "butler"), butler);
  chmodSync(join(bin, "butler"), 0o755);
  mkdirSync(join(cwd, "artifacts"));
  for (const name of [
    `SpikeForge-Desktop-${version}-linux-x86_64.tar.gz`,
    `SpikeForge-Desktop-${version}-windows-x64.zip`,
  ]) writeFileSync(join(cwd, "artifacts", name), "archive input\n");
  return cwd;
}

function publish(cwd) {
  const log = join(cwd, "butler.jsonl");
  command(cwd, "bash", ["-e", "-o", "pipefail", "-c", invocation], {
    env: { ...process.env, PATH: `${join(cwd, "bin")}:${process.env.PATH}`,
      DESKTOP_PUBLISH_LOG: log },
  });
  const calls = readFileSync(log, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line));
  const pushes = calls.filter((args) => args[0] === "push");
  assert.equal(pushes.length, 2);
  assert.deepEqual(pushes.map((args) => args.at(-1)), [
    "capsizegames/spikeforge-desktop:linux-x64",
    "capsizegames/spikeforge-desktop:windows-x64",
  ]);
  for (const args of pushes) {
    assert.equal(args[args.indexOf("--userversion") + 1], version);
    assert.ok(existsSync(join(cwd, args.at(-2))));
  }
  assert.deepEqual(calls.at(-1), ["status",
    "capsizegames/spikeforge-desktop"]);
}

test("tagged release publishes both channels from a fresh workspace", (t) => {
  const cwd = workspace(t);
  checkoutFromWorkflow(cwd);
  publish(cwd);
});

test("the actual checked-out publisher reads the tag version", (t) => {
  const cwd = workspace(t);
  checkout(cwd);
  publish(cwd);
});
