import assert from "node:assert/strict";
import test from "node:test";

import {
  currentRef,
  parseArgs,
  pinnedVersion,
  withRef,
} from "./sync_engine_ref.mjs";

const WORKFLOW = `jobs:
  build:
    steps:
      - uses: actions/checkout@v4
        with:
          ref: 1111111111111111111111111111111111111111
      - name: Check out the SpikeForge engine
        uses: actions/checkout@v4
        with:
          repository: Capsize-Games/spikeforge
          ref: 0a4f1feb4ad6ef6321d49aa768aaabd196502b20
          path: _backend
`;

test("reads the engine version the pins already name", () => {
  const pins = JSON.stringify({ packages: { spikeforge: "0.5.0" } });
  assert.equal(pinnedVersion(pins), "0.5.0");
});

test("rejects pins with no engine version", () => {
  assert.throws(() => pinnedVersion(JSON.stringify({ packages: {} })));
});

test("finds the engine ref", () => {
  assert.equal(currentRef(WORKFLOW), "0a4f1feb4ad6ef6321d49aa768aaabd196502b20");
});

/**
 * The repository's own checkout carries a `ref:` too, and it appears first.
 * Matching that one would rewrite the wrong line and pin the dashboard build
 * to an engine commit, so the anchor above the ref is load-bearing.
 */
test("ignores a ref belonging to another checkout", () => {
  const updated = withRef(WORKFLOW, "b".repeat(40));
  assert.match(updated, /ref: 1111111111111111111111111111111111111111/);
  assert.equal(currentRef(updated), "b".repeat(40));
});

test("reports a workflow with no engine checkout", () => {
  assert.throws(() => currentRef("jobs:\n  build:\n"), /no Capsize-Games/);
});

test("parses arguments", () => {
  assert.deepEqual(parseArgs(["--check"]), { check: true, sha: null });
  assert.deepEqual(parseArgs(["--sha", "abc1234"]), {
    check: false,
    sha: "abc1234",
  });
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
});
