const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  fakeHubApi,
  fakeSafeStorage,
  relaunch,
  session,
  tempUserDataDir,
} = require("./sign_in_session_test_support.cjs");

// The no-keyring path, PAT sign-in, sign-out, and subscriptions live in
// `sign_in_session_more.test.cjs` -- split out to keep each file under the
// 250-line limit.

test("signs in via the browser flow and persists a refresh token", async () => {
  const api = await fakeHubApi({ handle: "ada" });
  try {
    const s = session({ baseUrl: api.baseUrl });
    await s.signInWithBrowser();
    const state = s.getState();
    assert.equal(state.status, "signed-in");
    assert.equal(state.handle, "ada");
    assert.equal(state.persistent, true);
    assert.equal(state.warning, null);
  } finally {
    api.close();
  }
});

test("restores a persisted session on a fresh session object (simulating relaunch)", async () => {
  const api = await fakeHubApi({ handle: "ada" });
  const userDataDir = tempUserDataDir();
  const safeStorage = fakeSafeStorage(true);
  try {
    const first = session({ baseUrl: api.baseUrl, userDataDir, safeStorage });
    await first.signInWithBrowser();

    const second = relaunch({ baseUrl: api.baseUrl, userDataDir, safeStorage });
    assert.equal(second.getState().status, "signed-out");
    await second.restore();
    assert.equal(second.getState().status, "signed-in");
    assert.equal(second.getState().handle, "ada");
  } finally {
    api.close();
  }
});

test("a revoked stored credential restores to signed-out, not an error", async () => {
  const api = await fakeHubApi();
  const userDataDir = tempUserDataDir();
  const safeStorage = fakeSafeStorage(true);
  const first = session({ baseUrl: api.baseUrl, userDataDir, safeStorage });
  await first.signInWithBrowser();
  api.close(); // no server left to honor a refresh -- like a revoked token

  const second = relaunch({ baseUrl: api.baseUrl, userDataDir, safeStorage });
  await second.restore();
  assert.equal(second.getState().status, "signed-out");
});

test("nothing is written outside authDir on a normal sign-in", async () => {
  const api = await fakeHubApi({ handle: "ada" });
  const userDataDir = tempUserDataDir();
  try {
    const s = session({ baseUrl: api.baseUrl, userDataDir });
    await s.signInWithBrowser();
    assert.deepEqual(fs.readdirSync(userDataDir), ["auth"]);
  } finally {
    api.close();
  }
});
