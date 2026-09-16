/**
 * The tier rules decide whether a change pays for a CPU training run, so a
 * mistake here is either wasted CI minutes or an untested protocol change.
 * These pin both directions.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { selectTier } from "./select_e2e_tier.mjs";

test("documentation-only changes need no end-to-end run", () => {
  assert.equal(selectTier(["README.md"]), "none");
  assert.equal(selectTier(["marketing/itch/page.html", "images/x.png"]), "none");
  assert.equal(selectTier([]), "none");
});

test("interface changes need the smoke tier", () => {
  assert.equal(selectTier(["src/components/TopBar.tsx"]), "smoke");
  assert.equal(selectTier(["src/styles.css"]), "smoke");
  assert.equal(selectTier(["package.json"]), "smoke");
  assert.equal(selectTier(["tests/e2e/specs/smoke/boot.spec.ts"]), "smoke");
});

test("contract and shell changes need the full tier", () => {
  assert.equal(selectTier(["protocol/client_message.schema.json"]), "full");
  assert.equal(selectTier(["tests/e2e/backend-pins.json"]), "full");
  assert.equal(selectTier(["desktop/main.cjs"]), "full");
  assert.equal(selectTier(["src/useWebSocket.ts"]), "full");
  assert.equal(selectTier(["src/useTraining.ts"]), "full");
  assert.equal(selectTier(["src/components/pipelineInput.ts"]), "full");
});

test("the most expensive matching rule wins", () => {
  // A branch that touches a README, a component, and the protocol still has
  // to pay for the full tier.
  assert.equal(
    selectTier(["README.md", "src/components/TopBar.tsx", "protocol/x.json"]),
    "full",
  );
});
