import assert from "node:assert/strict";
import test from "node:test";

import {
  engineCommit,
  parseArgs,
  pinnedVersion,
  withEngineCommit,
} from "./sync_engine_ref.mjs";

function pins(version = "0.5.0", commit = "a".repeat(40)) {
  return JSON.stringify({
    protocol_version: "1.1",
    packages: { spikeforge: version },
    engine_commit: commit,
    extras: {},
    torch_index_url: "https://download.pytorch.org/whl/cpu",
  });
}

test("reads the engine version the pins already name", () => {
  assert.equal(pinnedVersion(pins()), "0.5.0");
});

test("rejects pins with no engine version", () => {
  assert.throws(() => pinnedVersion(JSON.stringify({ packages: {} })));
});

test("reads the engine commit the pins already name", () => {
  assert.equal(engineCommit(pins()), "a".repeat(40));
});

test("reports pins with no engine commit as absent", () => {
  const without = JSON.stringify({ packages: { spikeforge: "0.5.0" } });
  assert.equal(engineCommit(without), null);
});

test("moves the engine commit without touching the versions", () => {
  const wanted = "b".repeat(40);
  const updated = JSON.parse(withEngineCommit(pins(), wanted));
  assert.equal(updated.engine_commit, wanted);
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
