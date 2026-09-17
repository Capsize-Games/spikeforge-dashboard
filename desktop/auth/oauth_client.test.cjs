const assert = require("node:assert/strict");
const test = require("node:test");

const { fakeHubApi } = require("./test_support.cjs");
const {
  OAuthError,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
} = require("./oauth_client.cjs");

// Device-code, refresh, and profile coverage lives in
// `oauth_client_device.test.cjs` -- split out to keep each file under the
// 250-line limit.

test("builds an authorize URL with every required PKCE parameter", () => {
  const url = new URL(
    buildAuthorizeUrl({
      baseUrl: "https://hub.spikeforge.net",
      clientId: "spikeforge-desktop",
      redirectUri: "http://127.0.0.1:5555/callback",
      state: "the-state",
      codeChallenge: "the-challenge",
    }),
  );
  assert.equal(
    url.origin + url.pathname,
    "https://hub.spikeforge.net/oauth/authorize",
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "spikeforge-desktop");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "http://127.0.0.1:5555/callback",
  );
  assert.equal(url.searchParams.get("code_challenge"), "the-challenge");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "the-state");
  assert.ok(url.searchParams.get("scope"));
});

test("exchanges an authorization code for a token pair", async () => {
  const api = await fakeHubApi((request, raw) => {
    assert.equal(request.url, "/oauth/token");
    const params = new URLSearchParams(raw);
    assert.equal(params.get("grant_type"), "authorization_code");
    assert.equal(params.get("code"), "the-code");
    assert.equal(params.get("code_verifier"), "the-verifier");
    return {
      body: {
        access_token: "sfh_at_1",
        refresh_token: "sfh_rt_1",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "models:read models:write",
      },
    };
  });
  try {
    const pair = await exchangeAuthorizationCode({
      baseUrl: api.baseUrl,
      clientId: "spikeforge-desktop",
      redirectUri: "http://127.0.0.1:5555/callback",
      code: "the-code",
      verifier: "the-verifier",
    });
    assert.equal(pair.accessToken, "sfh_at_1");
    assert.equal(pair.refreshToken, "sfh_rt_1");
    assert.equal(pair.expiresIn, 3600);
  } finally {
    api.close();
  }
});

test("raises an OAuthError naming what the server said went wrong", async () => {
  const api = await fakeHubApi(() => ({
    status: 400,
    body: { error: "invalid_grant", error_description: "code already used" },
  }));
  try {
    await assert.rejects(
      exchangeAuthorizationCode({
        baseUrl: api.baseUrl,
        clientId: "spikeforge-desktop",
        redirectUri: "http://127.0.0.1:5555/callback",
        code: "used",
        verifier: "v",
      }),
      (error) => {
        assert.ok(error instanceof OAuthError);
        assert.equal(error.code, "invalid_grant");
        assert.match(error.message, /already used/);
        return true;
      },
    );
  } finally {
    api.close();
  }
});
