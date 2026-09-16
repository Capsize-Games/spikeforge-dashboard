/** Exercise the workflow's actual shell against fresh, main-only checkouts. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const branch = "chore/backend-pins";
const pins = "tests/e2e/backend-pins.json";
const workflow = readFileSync(new URL(
  "../.github/workflows/sync-backend-pins.yml", import.meta.url,
), "utf8");
const marker = "      - name: Open or update the pull request for the bump";
assert.ok(workflow.includes(marker), "the tested workflow step must exist");
const step = workflow.split(marker)[1].split("        run: |\n")[1];
assert.ok(step, "the tested workflow step must have a shell body");
const script = step.trimEnd().split("\n").map((line) => line.slice(10))
  .join("\n");

function command(cwd, program, args, env = {}) {
  const result = spawnSync(program, args, {
    cwd, encoding: "utf8", env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}

const git = (cwd, ...args) => command(cwd, "git", args);

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), "pin-sync-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin.git");
  const seed = join(root, "seed");
  git(root, "init", "--bare", "--initial-branch=main", origin);
  git(root, "init", "--initial-branch=main", seed);
  git(seed, "config", "user.name", "Test");
  git(seed, "config", "user.email", "test@example.invalid");
  mkdirSync(join(seed, "tests/e2e"), { recursive: true });
  writeFileSync(join(seed, pins), "old\n");
  git(seed, "add", pins);
  git(seed, "commit", "-m", "initial");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "origin", "main");
  return { root, origin };
}

function checkout(repo, name, version) {
  const cwd = join(repo.root, name);
  git(repo.root, "clone", "--single-branch", "--branch", "main",
    `file://${repo.origin}`, cwd);
  writeFileSync(join(cwd, pins), `${version}\n`);
  return cwd;
}

// Only the GitHub API is stubbed. Git, refs, leases and checkouts are real.
const fakeGh = `#!/usr/bin/env node
const fs = require("node:fs");
const file = process.env.PIN_SYNC_STATE;
const state = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8")) : { created: 0, edited: 0 };
const args = process.argv.slice(2);
if (args[0] !== "pr") process.exit(2);
if (args[1] === "list") {
  const query = args[args.indexOf("--jq") + 1];
  console.log(query === "length" ? state.created : 17);
} else if (args[1] === "create") {
  if (state.created) process.exit(3);
  state.created++;
} else if (args[1] === "edit" && args[2] === "17") {
  state.edited++;
} else process.exit(4);
fs.writeFileSync(file, JSON.stringify(state));
`;

function runSync(repo, cwd) {
  const bin = join(repo.root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "gh"), fakeGh);
  chmodSync(join(bin, "gh"), 0o755);
  writeFileSync(join(cwd, "sync.log"), "pins changed\n");
  // Keep the workflow's temporary files inside this test's checkout.
  const isolated = script.replaceAll("/tmp/sync.log", "./sync.log")
    .replaceAll("/tmp/body.md", "./body.md");
  command(cwd, "bash", ["-e", "-o", "pipefail", "-c", isolated], {
    PATH: `${bin}:${process.env.PATH}`,
    PIN_SYNC_STATE: join(repo.root, "pr.json"),
  });
}

test("fresh runs update one PR and pick up a newer manifest", (t) => {
  const repo = repository(t);
  for (const [name, version] of [
    ["day-one", "release-1"],
    ["day-two", "release-1"],
    ["new-manifest", "release-2"],
  ]) {
    const cwd = checkout(repo, name, version);
    assert.equal(git(cwd, "branch", "-r", "--list", `origin/${branch}`), "");
    runSync(repo, cwd);
    assert.equal(git(repo.origin, "show", `${branch}:${pins}`), version);
  }
  const state = JSON.parse(readFileSync(join(repo.root, "pr.json"), "utf8"));
  assert.deepEqual(state, { created: 1, edited: 2 });
});

test("a concurrent branch update is not overwritten", (t) => {
  const repo = repository(t);
  runSync(repo, checkout(repo, "first", "release-1"));
  const cwd = checkout(repo, "racing-run", "release-2");
  // Inject a competing remote update immediately before the actual push.
  // This must fail with stale info rather than overwrite the competing tip.
  const raced = script.replace("git push ", [
    `git push origin main:refs/heads/${branch} --force`,
    "git push ",
  ].join("\n"));
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", raced], {
    cwd, encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stale info/);
  assert.equal(git(repo.origin, "rev-parse", branch),
    git(repo.origin, "rev-parse", "main"));
});
