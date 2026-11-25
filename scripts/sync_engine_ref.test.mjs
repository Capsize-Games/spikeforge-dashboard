import assert from "node:assert/strict";
import test from "node:test";

import {
  currentCommit,
  parseArgs,
  pinnedVersion,
  withCommit,
} from "./sync_engine_ref.mjs";

const PINS = JSON.stringify({
  protocol_version: "1.1",
  engine_commit: "0a4f1feb4ad6ef6321d49aa768aaabd196502b20",
  packages: { spikeforge: "0.5.0" },
});

test("reads the engine version the pins already name", () => {
  const pins = JSON.stringify({ packages: { spikeforge: "0.5.0" } });
  assert.equal(pinnedVersion(pins), "0.5.0");
});

test("rejects pins with no engine version", () => {
  assert.throws(() => pinnedVersion(JSON.stringify({ packages: {} })));
});

test("rejects pins that are not JSON", () => {
  assert.throws(() => pinnedVersion("not json"));
});

test("reads the engine commit the pins name", () => {
  assert.equal(
    currentCommit(PINS),
    "0a4f1feb4ad6ef6321d49aa768aaabd196502b20",
  );
});

test("rejects pins with no engine commit", () => {
  const pins = JSON.stringify({ packages: { spikeforge: "0.5.0" } });
  assert.throws(() => currentCommit(pins), /no engine_commit/);
});

test("rejects pins that are not JSON when reading the commit", () => {
  assert.throws(() => currentCommit("not json"));
});

/**
 * The commit moves inside the data file. An earlier version rewrote the
 * `ref:` line of `desktop-release.yml` here, which meant the nightly bump
 * touched a workflow file and could not be pushed without the `workflows`
 * permission. The release workflow now reads the pins at build time, so
 * this helper must never mention a workflow path.
 */
test("moves the commit without touching any workflow text", () => {
  const updated = withCommit(PINS, "b".repeat(40));
  assert.equal(JSON.parse(updated).engine_commit, "b".repeat(40));
  assert.doesNotMatch(updated, /\.ya?ml/);
  assert.equal(currentCommit(updated), "b".repeat(40));
});

test("keeps the other pins when the commit moves", () => {
  const updated = JSON.parse(withCommit(PINS, "c".repeat(40)));
  assert.equal(updated.packages.spikeforge, "0.5.0");
  assert.equal(updated.protocol_version, "1.1");
});

test("parses arguments", () => {
  assert.deepEqual(parseArgs(["--check"]), { check: true, sha: null });
  assert.deepEqual(parseArgs(["--sha", "abc1234"]), {
    check: false,
    sha: "abc1234",
  });
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
});
