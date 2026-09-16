/**
 * The tier rules decide whether a change pays for a CPU training run, so a
 * mistake here is either wasted CI minutes or an untested protocol change.
 * These pin both directions.
 *
 * The regression block is the important one. An earlier version of the rules
 * enumerated what needed the full tier, and every omission failed in the
 * dangerous direction: a change to a full-tier spec, to the fixture every spec
 * shares, or to the selector itself all selected a cheaper tier than the
 * change deserved.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { selectTier } from "./select_e2e_tier.mjs";

test("documentation-only changes need no end-to-end run", () => {
  assert.equal(selectTier(["README.md"]), "none");
  assert.equal(selectTier(["tests/e2e/README.md"]), "none");
  assert.equal(selectTier(["marketing/itch/page.html"]), "none");
  assert.equal(selectTier(["images/dashboard.png"]), "none");
  assert.equal(selectTier([]), "none");
});

test("presentational changes need only the smoke tier", () => {
  assert.equal(selectTier(["src/styles.css"]), "smoke");
  assert.equal(selectTier(["src/styles/model-actions.css"]), "smoke");
  assert.equal(selectTier(["src/i18n/locales/ja.ts"]), "smoke");
});

test("application and contract changes need the full tier", () => {
  assert.equal(selectTier(["protocol/client_message.schema.json"]), "full");
  assert.equal(selectTier(["tests/e2e/backend-pins.json"]), "full");
  assert.equal(selectTier(["desktop/main.cjs"]), "full");
  assert.equal(selectTier(["src/useWebSocket.ts"]), "full");
  assert.equal(selectTier(["src/components/TopBar.tsx"]), "full");
  assert.equal(selectTier(["package.json"]), "full");
});

test("a change to a full-tier test runs that test", () => {
  // Regression: these selected "smoke", so a PR could change a full-suite
  // assertion without ever executing it.
  assert.equal(selectTier(["tests/e2e/specs/full/pipeline.spec.ts"]), "full");
  assert.equal(selectTier(["tests/e2e/specs/full/inference.spec.ts"]), "full");
  const setup = ["tests/e2e/specs/full/checkpoint.setup.ts"];
  assert.equal(selectTier(setup), "full");
});

test("a change to shared test machinery runs the full tier", () => {
  // Regression: the fixture every spec depends on selected "smoke".
  assert.equal(selectTier(["tests/e2e/fixtures/dashboard.ts"]), "full");
  assert.equal(selectTier(["tests/e2e/fixtures/dashboard-page.ts"]), "full");
  assert.equal(selectTier(["tests/e2e/support/electron.ts"]), "full");
  assert.equal(selectTier(["playwright.config.ts"]), "full");
});

test("a change to the selection machinery runs the full tier", () => {
  // Regression: these selected "none", so the thing deciding what to run
  // could change without anything running.
  assert.equal(selectTier(["scripts/select_e2e_tier.mjs"]), "full");
  assert.equal(selectTier(["scripts/select_e2e_tier.test.mjs"]), "full");
  assert.equal(selectTier(["scripts/provision_e2e_backend.py"]), "full");
  assert.equal(selectTier(["scripts/run_e2e_server.mjs"]), "full");
  assert.equal(selectTier([".github/workflows/ci.yml"]), "full");
});

test("functional controls run the workflows they drive", () => {
  // Regression: pipeline and training controls selected "smoke", so they
  // could change without the tier that actually runs a pipeline or a
  // training job.
  assert.equal(selectTier(["src/components/PipelinePanel.tsx"]), "full");
  assert.equal(selectTier(["src/components/PipelineRunControls.tsx"]), "full");
  assert.equal(selectTier(["src/components/pipelineInput.ts"]), "full");
  assert.equal(selectTier(["src/components/TrainControls.tsx"]), "full");
  assert.equal(selectTier(["src/components/ModelPanel.tsx"]), "full");
});

test("the most expensive matching rule wins", () => {
  assert.equal(
    selectTier(["README.md", "src/styles.css", "protocol/x.json"]),
    "full",
  );
  assert.equal(selectTier(["README.md", "src/styles.css"]), "smoke");
});

test("an unrecognised path does not silently select a tier", () => {
  // Nothing under these runs in the browser, so they cost nothing -- but the
  // assertion records that the fallthrough is deliberate.
  assert.equal(selectTier([".editorconfig"]), "none");
  assert.equal(selectTier(["electron-builder.yml"]), "none");
});
