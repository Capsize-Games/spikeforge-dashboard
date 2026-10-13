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

// Browser sign-in and restore live in `sign_in_session.test.cjs` -- split
// out to keep each file under the 250-line limit.

// The branch the issue calls out by name: no keyring means no persistence,
// ever -- and the user is told plainly, not left to find out on restart.
test("signs in in-memory only when encryption is unavailable, with a warning", async () => {
  const api = await fakeHubApi({ handle: "ada" });
  const userDataDir = tempUserDataDir();
  try {
    const s = session({
      baseUrl: api.baseUrl,
      userDataDir,
      safeStorage: fakeSafeStorage(false),
    });
    await s.signInWithBrowser();
    const state = s.getState();
    assert.equal(state.status, "signed-in");
    assert.equal(state.persistent, false);
    assert.equal(state.warning, "no_secure_storage");

    // Nothing was written anywhere under the profile directory.
    assert.deepEqual(fs.readdirSync(userDataDir), []);
  } finally {
    api.close();
  }
});

test("a session with no keyring does not restore anything on relaunch", async () => {
  const api = await fakeHubApi({ handle: "ada" });
  const userDataDir = tempUserDataDir();
  const safeStorage = fakeSafeStorage(false);
  try {
    const first = session({ baseUrl: api.baseUrl, userDataDir, safeStorage });
    await first.signInWithBrowser();

    const second = relaunch({ baseUrl: api.baseUrl, userDataDir, safeStorage });
    await second.restore();
    assert.equal(second.getState().status, "signed-out");
  } finally {
    api.close();
  }
});

test("signs in with a pasted PAT and persists it like a refresh token", async () => {
  const api = await fakeHubApi({ handle: "ada" });
  const userDataDir = tempUserDataDir();
  try {
    const s = session({ baseUrl: api.baseUrl, userDataDir });
    await s.signInWithPat("  sfh_pat_example  ");
    const state = s.getState();
    assert.equal(state.status, "signed-in");
    assert.equal(state.persistent, true);
  } finally {
    api.close();
  }
});

test("sign-out clears the stored credential and the in-memory session", async () => {
  const api = await fakeHubApi({ handle: "ada" });
  const userDataDir = tempUserDataDir();
  const safeStorage = fakeSafeStorage(true);
  try {
    const s = session({ baseUrl: api.baseUrl, userDataDir, safeStorage });
    await s.signInWithBrowser();
    s.signOut();
    assert.equal(s.getState().status, "signed-out");

    const second = relaunch({ baseUrl: api.baseUrl, userDataDir, safeStorage });
    await second.restore();
    assert.equal(second.getState().status, "signed-out");
  } finally {
    api.close();
  }
});

test("notifies subscribers on every state change", async () => {
  const api = await fakeHubApi({ handle: "ada" });
  try {
    const s = session({ baseUrl: api.baseUrl });
    const seen = [];
    const unsubscribe = s.onStateChanged((state) => seen.push(state.status));
    await s.signInWithBrowser();
    s.signOut();
    unsubscribe();
    await s.signInWithPat("sfh_pat_x").catch(() => {});
    assert.deepEqual(seen, ["signed-in", "signed-out"]);
  } finally {
    api.close();
  }
});
