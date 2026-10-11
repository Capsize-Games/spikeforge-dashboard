/** Test archive extraction and cleanup around the real publication script. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { installButler, releaseArchives } from "./publish_itch_test_helpers.mjs";

const source = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(source, "scripts/publish_itch.sh");
const version = JSON.parse(readFileSync(join(source, "package.json"))).version;

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "desktop publisher test "));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const bin = installButler(cwd);
  const artifacts = releaseArchives(cwd, version);
  const temporary = join(cwd, "temporary");
  mkdirSync(temporary);
  return { cwd, artifacts, temporary, env: {
    ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: temporary,
    DESKTOP_PUBLISH_LOG: join(cwd, "butler.jsonl"),
  } };
}

function publish(fixture, extraEnv = {}) {
  const result = spawnSync("bash", [script,
    "capsizegames/spikeforge-desktop", fixture.artifacts], {
    cwd: source, encoding: "utf8", env: { ...fixture.env, ...extraEnv },
  });
  const log = fixture.env.DESKTOP_PUBLISH_LOG;
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line)) : [];
  return { result, calls };
}

function checkPushes(calls, fixture) {
  const pushes = calls.filter(({ args }) => args[0] === "push");
  assert.equal(pushes.length, 2);
  assert.deepEqual(pushes.map(({ sourceType }) => sourceType),
    ["file", "directory"]);
  assert.equal(pushes[0].args.at(-2), join(fixture.artifacts,
    `app-${version}-linux-x86_64.tar.gz`));
  for (const { args } of pushes) {
    assert.equal(args[args.indexOf("--userversion") + 1], version);
    assert.ok(args.includes("--if-changed"));
    assert.ok(args.includes("--fix-permissions"));
  }
  assert.ok(!existsSync(pushes[1].args.at(-2)), "temporary source is cleaned");
  assert.deepEqual(readdirSync(fixture.temporary), []);
}

test("Windows ZIP is extracted with runtime and license files intact", (t) => {
  const context = fixture(t);
  const { result, calls } = publish(context);
  assert.equal(result.status, 0, result.stderr);
  checkPushes(calls, context);
  assert.deepEqual(calls.at(-1).args,
    ["status", "capsizegames/spikeforge-desktop"]);
});

test("Windows push failure cleans its extracted directory", (t) => {
  const context = fixture(t);
  const { result, calls } = publish(context, { DESKTOP_FAIL_WINDOWS: "1" });
  assert.equal(result.status, 17, result.stderr);
  checkPushes(calls, context);
  assert.equal(calls.length, 2, "failed push must not report final status");
});

test("invalid Windows archive cleans up before either channel is pushed", (t) => {
  const context = fixture(t);
  writeFileSync(join(context.artifacts,
    `app-${version}-windows-x64.zip`), "invalid ZIP\n");
  const { result, calls } = publish(context);
  assert.notEqual(result.status, 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(readdirSync(context.temporary), []);
});

test("termination cleans the extracted Windows directory", (t) => {
  const context = fixture(t);
  const { result, calls } = publish(context, { DESKTOP_SIGNAL_WINDOWS: "1" });
  assert.equal(result.status, 143, result.stderr);
  checkPushes(calls, context);
  assert.equal(calls.length, 2);
});
