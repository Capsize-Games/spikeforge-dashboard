/**
 * `sha256Hex`, checked against Node's own `crypto` -- an independent
 * implementation of the same algorithm.
 *
 * `putUploadBytes` is a thin `XMLHttpRequest` wrapper with no logic worth
 * faking a browser API to reach; it is exercised for real by clicking
 * through the Publish flow, the same way `useWebSocket.ts`'s real socket
 * handling has no unit test of its own.
 *
 * Run with `npm run scripts:test`.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { sha256Hex } from "./hubUpload.ts";

test("sha256Hex agrees with node:crypto on the empty buffer", async () => {
  const bytes = new ArrayBuffer(0);
  const expected = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
  assert.equal(await sha256Hex(bytes), expected);
});

test("sha256Hex agrees with node:crypto on real bytes", async () => {
  const text = "a spiking neural network bundle, roughly";
  const bytes = new TextEncoder().encode(text).buffer;
  const expected = createHash("sha256").update(text).digest("hex");
  assert.equal(await sha256Hex(bytes), expected);
});
