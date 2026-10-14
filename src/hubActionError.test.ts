/**
 * Hub pull/build error capture.
 *
 * A failed action must surface the specific error the server sent, and a
 * pre-1.1 server -- which answers an unknown action type with a validation
 * error -- must read as an absent action rather than a failed one. Both
 * classifications are pure, so they are pinned here instead of against a
 * live server.
 *
 * Run with `npm run scripts:test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { hubActionError, isTerminalPullStatus } from "./hubActionError.ts";

/** The shape a 1.0 server's pydantic stack sends for an unknown type. */
function literalError(action: string): string {
  return (
    "1 validation error for ClientMessage\ntype\n" +
    `  Input should be 'hub_list', 'hub_import' [type=literal_error, ` +
    `input_value='${action}', input_type=str]`
  );
}

test("a missing name keeps the server's own words", () => {
  const error = hubActionError(
    "pull",
    "@alice/model",
    "hub_pull requires a model name",
  );
  assert.equal(error.action, "pull");
  assert.equal(error.target, "@alice/model");
  assert.equal(error.detail, "hub_pull requires a model name");
  assert.equal(error.unsupported, false);
});

test("a failed build keeps the server's own words", () => {
  const error = hubActionError(
    "build",
    "my_model",
    "bundle build failed: checkpoint 'my_model' has no weights file",
  );
  assert.equal(error.action, "build");
  assert.equal(error.detail.includes("my_model"), true);
  assert.equal(error.unsupported, false);
});

test("a pre-1.1 unknown-type rejection reads as an absent action", () => {
  const pull = hubActionError("pull", "@a/m", literalError("hub_pull"));
  assert.equal(pull.unsupported, true);
  assert.equal(pull.detail.includes("hub_pull"), true);
  const build = hubActionError("build", "m", literalError("bundle_build"));
  assert.equal(build.unsupported, true);
});

test("a validation error for the other action is not unsupported", () => {
  const error = hubActionError("build", "m", literalError("hub_pull"));
  assert.equal(error.unsupported, false);
});

test("a structured payload renders its message", () => {
  const error = hubActionError("pull", "@a/m", {
    code: "protocol_version_mismatch",
    message: "client protocol '2.0' is incompatible",
  });
  assert.equal(error.detail, "client protocol '2.0' is incompatible");
  assert.equal(error.unsupported, false);
});

test("an unshaped payload falls back without crashing", () => {
  assert.equal(hubActionError("pull", "m", null).detail, "Unknown error");
  assert.equal(hubActionError("pull", "m", 42).detail, "Unknown error");
  assert.equal(
    hubActionError("pull", "m", { code: "x" }).detail,
    "Unknown error",
  );
});

test("only the settled pull statuses end the action", () => {
  assert.equal(isTerminalPullStatus("downloading"), false);
  assert.equal(isTerminalPullStatus("idle"), false);
  assert.equal(isTerminalPullStatus("done"), true);
  assert.equal(isTerminalPullStatus("cancelled"), true);
  assert.equal(isTerminalPullStatus("error"), true);
});
