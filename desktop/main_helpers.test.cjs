const assert = require("node:assert/strict");
const test = require("node:test");

const {
  backendFilename,
  isSafeExternalUrl,
  reservePort,
} = require("./main_helpers.cjs");

test("uses the platform backend filename", () => {
  assert.equal(backendFilename("win32"), "spikeforge-backend.exe");
  assert.equal(backendFilename("linux"), "spikeforge-backend");
  assert.equal(backendFilename("darwin"), "spikeforge-backend");
});

test("allows only web URLs to leave the application", () => {
  assert.equal(isSafeExternalUrl("https://spikeforge.net/docs/"), true);
  assert.equal(isSafeExternalUrl("http://127.0.0.1:8877"), true);
  assert.equal(isSafeExternalUrl("file:///etc/passwd"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalUrl("not a url"), false);
});

test("reserves an ephemeral localhost port", async () => {
  const port = await reservePort();
  assert.ok(Number.isInteger(port));
  assert.ok(port > 0 && port <= 65535);
});
