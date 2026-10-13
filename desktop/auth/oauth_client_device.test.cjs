const assert = require("node:assert/strict");
const test = require("node:test");

const { fakeHubApi } = require("./test_support.cjs");
const {
  startDeviceCode,
  pollDeviceCode,
  refreshSession,
  fetchProfile,
} = require("./oauth_client.cjs");

// Authorize-URL and authorization-code coverage lives in
// `oauth_client.test.cjs` -- split out to keep each file under the 250-line
// limit.

test("starts a device-code attempt", async () => {
  const api = await fakeHubApi((request) => {
    assert.equal(request.url, "/oauth/device_code");
    return {
      body: {
        device_code: "dc_1",
        user_code: "WXYZ-1234",
        verification_uri: "https://hub.spikeforge.net/activate",
        expires_in: 900,
        interval: 5,
      },
    };
  });
  try {
    const started = await startDeviceCode({
      baseUrl: api.baseUrl,
      clientId: "spikeforge-desktop",
    });
    assert.equal(started.userCode, "WXYZ-1234");
    assert.equal(
      started.verificationUri,
      "https://hub.spikeforge.net/activate",
    );
    assert.equal(started.intervalSeconds, 5);
  } finally {
    api.close();
  }
});

test("device-code polling reports pending, slow_down, and granted", async () => {
  let call = 0;
  const api = await fakeHubApi(() => {
    call += 1;
    if (call === 1) {
      return { status: 400, body: { error: "authorization_pending" } };
    }
    if (call === 2) {
      return { status: 400, body: { error: "slow_down" } };
    }
    return {
      body: {
        access_token: "sfh_at_2",
        refresh_token: "sfh_rt_2",
        expires_in: 3600,
        scope: "models:read",
      },
    };
  });
  try {
    const args = { baseUrl: api.baseUrl, clientId: "d", deviceCode: "dc" };
    assert.deepEqual(await pollDeviceCode(args), { status: "pending" });
    assert.deepEqual(await pollDeviceCode(args), { status: "slow_down" });
    const granted = await pollDeviceCode(args);
    assert.equal(granted.status, "granted");
    assert.equal(granted.pair.accessToken, "sfh_at_2");
  } finally {
    api.close();
  }
});

test("device-code polling reports expiry and denial as terminal, not errors", async () => {
  const expiredApi = await fakeHubApi(() => ({
    status: 400,
    body: { error: "expired_token" },
  }));
  try {
    assert.deepEqual(
      await pollDeviceCode({
        baseUrl: expiredApi.baseUrl,
        clientId: "d",
        deviceCode: "dc",
      }),
      { status: "expired" },
    );
  } finally {
    expiredApi.close();
  }

  const deniedApi = await fakeHubApi(() => ({
    status: 400,
    body: { error: "access_denied" },
  }));
  try {
    assert.deepEqual(
      await pollDeviceCode({
        baseUrl: deniedApi.baseUrl,
        clientId: "d",
        deviceCode: "dc",
      }),
      { status: "denied" },
    );
  } finally {
    deniedApi.close();
  }
});

test("refreshes a session via /v1/auth/refresh", async () => {
  const api = await fakeHubApi((request, raw) => {
    assert.equal(request.url, "/v1/auth/refresh");
    assert.deepEqual(JSON.parse(raw), { refresh_token: "sfh_rt_old" });
    return {
      body: {
        access_token: "sfh_at_new",
        refresh_token: "sfh_rt_new",
        expires_in: 3600,
        scope: "models:read",
      },
    };
  });
  try {
    const pair = await refreshSession({
      baseUrl: api.baseUrl,
      refreshToken: "sfh_rt_old",
    });
    assert.equal(pair.accessToken, "sfh_at_new");
    assert.equal(pair.refreshToken, "sfh_rt_new");
  } finally {
    api.close();
  }
});

test("fetches the signed-in profile with a bearer header", async () => {
  const api = await fakeHubApi((request) => {
    assert.equal(request.headers.authorization, "Bearer sfh_at_1");
    return { body: { handle: "ada", display_name: "Ada" } };
  });
  try {
    const profile = await fetchProfile({
      baseUrl: api.baseUrl,
      accessToken: "sfh_at_1",
    });
    assert.deepEqual(profile, { handle: "ada", displayName: "Ada" });
  } finally {
    api.close();
  }
});
