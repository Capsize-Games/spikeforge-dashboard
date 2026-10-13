/**
 * HTTP client for the hub-api desktop sign-in surface.
 *
 * Endpoint shapes follow `plans/hub_accounts_plan.md` §3.3/§9 in the
 * `spikeforge` repo and `spikeforge-hub-api`'s existing, already-deployed
 * identity routes (`hub_api/routes/{auth,me,tokens}.py`, `hub_api/auth/
 * credentials.py`): a token pair is `{access_token, refresh_token,
 * token_type, expires_in, scope}`, and a bearer credential goes in an
 * `Authorization: Bearer <token>` header. The four new routes this depends on
 * (`GET /oauth/authorize`, `POST /oauth/token`, `POST /oauth/device_code`,
 * `GET /activate`) are tracked as spikeforge-hub-api#3 and were not yet
 * merged as of this writing, so the authorization-code and device-code
 * request/response shapes below follow that issue's stated contract and
 * RFC 6749 / RFC 8628 exactly rather than a live server.
 *
 * Plain `fetch` (global in Node 22 / this Electron's main process) against
 * whatever `baseUrl` is passed in, so this is testable against a throwaway
 * `node:http` server standing in for hub-api.
 */

const DEFAULT_SCOPE = "models:read models:write";

/** An OAuth-style error, carrying the machine-readable `error` code. */
class OAuthError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
  }
}

/** Build the desktop loopback authorization URL for the system browser. */
function buildAuthorizeUrl({
  baseUrl,
  clientId,
  redirectUri,
  state,
  codeChallenge,
  scope = DEFAULT_SCOPE,
}) {
  const url = new URL("/oauth/authorize", baseUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", scope);
  return url.toString();
}

async function postForm(baseUrl, path, fields) {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  return readJsonOrThrow(response, path);
}

async function postJson(baseUrl, path, body) {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJsonOrThrow(response, path);
}

async function readJsonOrThrow(response, path) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload.error_description ||
      payload.detail ||
      payload.error ||
      `request to ${path} failed (${response.status})`;
    throw new OAuthError(message, payload.error);
  }
  return payload;
}

/** Normalize a token-endpoint response into the shape callers want. */
function toPair(payload) {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
    scope: payload.scope,
  };
}

/** Redeem an authorization code for an access/refresh pair. */
async function exchangeAuthorizationCode({
  baseUrl,
  clientId,
  redirectUri,
  code,
  verifier,
}) {
  const payload = await postForm(baseUrl, "/oauth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier,
  });
  return toPair(payload);
}

/** Start a device-authorization attempt (RFC 8628). */
async function startDeviceCode({ baseUrl, clientId, scope = DEFAULT_SCOPE }) {
  const payload = await postForm(baseUrl, "/oauth/device_code", {
    client_id: clientId,
    scope,
  });
  return {
    deviceCode: payload.device_code,
    userCode: payload.user_code,
    verificationUri: payload.verification_uri,
    verificationUriComplete: payload.verification_uri_complete ?? null,
    expiresIn: payload.expires_in,
    intervalSeconds: payload.interval ?? 5,
  };
}

//: RFC 8628 §3.5 error codes a poller must handle without treating them as
//: fatal (`authorization_pending`, `slow_down`) versus ones that end the
//: attempt (`expired_token`, `access_denied`).
const DEVICE_PENDING = new Set(["authorization_pending", "slow_down"]);
const DEVICE_TERMINAL = new Set(["expired_token", "access_denied"]);

/** One poll of the device-code grant. Callers own the interval and backoff. */
async function pollDeviceCode({ baseUrl, clientId, deviceCode }) {
  try {
    const payload = await postForm(baseUrl, "/oauth/token", {
      grant_type: "device_code",
      client_id: clientId,
      device_code: deviceCode,
    });
    return { status: "granted", pair: toPair(payload) };
  } catch (error) {
    if (error instanceof OAuthError) {
      if (error.code === "slow_down") return { status: "slow_down" };
      if (DEVICE_PENDING.has(error.code)) return { status: "pending" };
      if (DEVICE_TERMINAL.has(error.code)) {
        const status = error.code === "expired_token" ? "expired" : "denied";
        return { status };
      }
    }
    throw error;
  }
}

/**
 * Exchange a stored refresh token for a new pair, via the identity API's
 * existing `/v1/auth/refresh` (`hub_api/routes/auth.py::refresh`) rather
 * than a `grant_type=refresh_token` call to `/oauth/token` -- the latter is
 * not part of the stated desktop-sign-in contract, while this endpoint is
 * already live and does exactly this (`credentials.rotate`).
 */
async function refreshSession({ baseUrl, refreshToken }) {
  const payload = await postJson(baseUrl, "/v1/auth/refresh", {
    refresh_token: refreshToken,
  });
  return toPair(payload);
}

/** Fetch the signed-in profile for display (`GET /v1/me`). */
async function fetchProfile({ baseUrl, accessToken }) {
  const response = await fetch(new URL("/v1/me", baseUrl), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await readJsonOrThrow(response, "/v1/me");
  return { handle: payload.handle, displayName: payload.display_name ?? null };
}

module.exports = {
  DEFAULT_SCOPE,
  OAuthError,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  startDeviceCode,
  pollDeviceCode,
  refreshSession,
  fetchProfile,
};
