const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const { generateState, generatePkce, METHOD } = require("./pkce.cjs");

test("generates a URL-safe, sufficiently long state value", () => {
  const state = generateState();
  assert.match(state, /^[A-Za-z0-9_-]+$/);
  assert.ok(state.length >= 24);
  assert.notEqual(state, generateState());
});

test("generates a verifier and its matching S256 challenge", () => {
  const { verifier, challenge, method } = generatePkce();
  assert.equal(method, METHOD);
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);

  const expected = crypto
    .createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  assert.equal(challenge, expected);
});

test("never reuses a verifier across calls", () => {
  const a = generatePkce();
  const b = generatePkce();
  assert.notEqual(a.verifier, b.verifier);
  assert.notEqual(a.challenge, b.challenge);
});
