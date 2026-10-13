/**
 * Desktop-runtime detection (the gate for offering Publish at all -- see
 * plans/hub_accounts_plan.md §8.3) and the token accessor's degrade-safe
 * behavior when issue #8's preload bridge is absent (a browser tab).
 *
 * Run with `npm run scripts:test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { getAccessToken, isDesktopRuntime } from "./hubAuth.ts";

test("Electron's own user agent is recognized as the desktop runtime", () => {
  assert.equal(
    isDesktopRuntime(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) SpikeForge Desktop/0.2.3 Chrome/128.0.0.0 " +
        "Electron/34.0.0 Safari/537.36",
    ),
    true,
  );
});

test("an ordinary browser tab is not the desktop runtime", () => {
  assert.equal(
    isDesktopRuntime(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    ),
    false,
  );
});

test("an empty user agent is not the desktop runtime", () => {
  assert.equal(isDesktopRuntime(""), false);
});

test("with no window (plain Node) the token accessor reports signed out", async () => {
  // No argument: exercises the real `typeof window === "undefined"` branch,
  // since this test file runs under plain Node with no `window` global.
  assert.equal(await getAccessToken(), null);
});

test("with no bridge supplied, the token accessor reports signed out", async () => {
  assert.equal(await getAccessToken(undefined), null);
});

test("a signed-in bridge is read through faithfully", async () => {
  const bridge = {
    getAccessToken: async () => "hub-token-abc",
  };
  assert.equal(await getAccessToken(bridge), "hub-token-abc");
});

test("a signed-out bridge resolves to null", async () => {
  const bridge = {
    getAccessToken: async () => null,
  };
  assert.equal(await getAccessToken(bridge), null);
});
