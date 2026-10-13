const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { reservePort } = require("../main_helpers.cjs");
const { waitForLoopbackCallback } = require("./loopback_server.cjs");

/** GET `path` on the loopback listener and return its status and body. */
function get(port, requestPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: requestPath }, (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode, body }),
        );
      })
      .on("error", reject);
  });
}

test("resolves with the code and state from a normal redirect", async () => {
  const port = await reservePort();
  const waiting = waitForLoopbackCallback(port);

  const response = await get(port, "/callback?code=abc123&state=xyz789");
  assert.equal(response.status, 200);
  assert.match(response.body, /signed in/i);

  assert.deepEqual(await waiting, { code: "abc123", state: "xyz789" });
});

test("rejects when the provider redirects back with an error", async () => {
  const port = await reservePort();
  const waiting = waitForLoopbackCallback(port);
  // Attached before the triggering request goes out, so the rejection is
  // never briefly unhandled.
  const assertion = assert.rejects(waiting, /user declined/);

  const response = await get(
    port,
    "/callback?error=access_denied&error_description=user+declined",
  );
  assert.equal(response.status, 200);
  assert.match(response.body, /failed/i);

  await assertion;
});

test("rejects a callback missing its code or state", async () => {
  const port = await reservePort();
  const waiting = waitForLoopbackCallback(port);
  const assertion = assert.rejects(waiting, /missing/);

  await get(port, "/callback?code=onlycode");
  await assertion;
});

test("ignores requests to any other path and keeps waiting", async () => {
  const port = await reservePort();
  const waiting = waitForLoopbackCallback(port);

  const probe = await get(port, "/favicon.ico");
  assert.equal(probe.status, 404);

  const real = await get(port, "/callback?code=abc&state=xyz");
  assert.equal(real.status, 200);
  assert.deepEqual(await waiting, { code: "abc", state: "xyz" });
});

test("rejects once the timeout elapses with nothing received", async () => {
  const port = await reservePort();
  await assert.rejects(
    waitForLoopbackCallback(port, { timeoutMs: 20 }),
    /timed out/,
  );
});

test("rejects immediately when the caller aborts", async () => {
  const port = await reservePort();
  const controller = new AbortController();
  const waiting = waitForLoopbackCallback(port, { signal: controller.signal });

  controller.abort();
  await assert.rejects(waiting, /cancelled/);
});

test("closes the listener after settling, freeing the port", async () => {
  const port = await reservePort();
  await waitForLoopbackCallback(port, { timeoutMs: 20 }).catch(() => {});

  // If the server were still listening, binding again would fail.
  const second = await waitForLoopbackCallback(port, { timeoutMs: 20 }).catch(
    (error) => error,
  );
  assert.ok(second instanceof Error);
  assert.match(second.message, /timed out/);
});
