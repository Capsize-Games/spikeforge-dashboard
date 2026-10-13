/**
 * Shared fixtures for `sign_in_session.test.cjs` and
 * `sign_in_session_more.test.cjs`: a fake `safeStorage`, a fake "system
 * browser" that completes the loopback redirect itself, and a fake hub-api
 * covering `/oauth/token`, `/v1/auth/refresh`, and `/v1/me`.
 *
 * Not itself a `*.test.cjs` file, so `node --test` does not try to run it.
 */

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { reservePort, isSafeExternalUrl } = require("../main_helpers.cjs");
const { createSignInSession } = require("./sign_in_session.cjs");

function fakeSafeStorage(available) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plaintext) => Buffer.from(`enc:${plaintext}`, "utf8"),
    decryptString: (buffer) => {
      const text = buffer.toString("utf8");
      if (!text.startsWith("enc:")) throw new Error("not our ciphertext");
      return text.slice("enc:".length);
    },
  };
}

function tempUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sf-session-"));
}

/** A fake hub-api covering `/oauth/token`, `/v1/auth/refresh`, and `/v1/me`,
 * enough for a full loopback round trip plus restore. */
async function fakeHubApi({ handle = "ada" } = {}) {
  const port = await reservePort();
  let issuedRefresh = "sfh_rt_1";
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const send = (body, status = 200) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(body));
      };
      if (request.url === "/oauth/token") {
        return send({
          access_token: "sfh_at_1",
          refresh_token: issuedRefresh,
          expires_in: 3600,
          scope: "models:read",
        });
      }
      if (request.url === "/v1/auth/refresh") {
        const body = JSON.parse(raw || "{}");
        if (body.refresh_token !== issuedRefresh) {
          return send({ detail: "no such refresh token" }, 401);
        }
        issuedRefresh = "sfh_rt_2";
        return send({
          access_token: "sfh_at_2",
          refresh_token: issuedRefresh,
          expires_in: 3600,
          scope: "models:read",
        });
      }
      if (request.url === "/v1/me") {
        return send({ handle, display_name: null });
      }
      return send({ detail: "not found" }, 404);
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() };
}

function completingBrowser() {
  return (authorizeUrl) => {
    const url = new URL(authorizeUrl);
    const redirectUri = new URL(url.searchParams.get("redirect_uri"));
    redirectUri.searchParams.set("code", "the-code");
    redirectUri.searchParams.set("state", url.searchParams.get("state"));
    return new Promise((resolve, reject) => {
      http
        .get(redirectUri, (response) => {
          response.resume();
          response.on("end", resolve);
        })
        .on("error", reject);
    });
  };
}

function session(overrides = {}) {
  return createSignInSession({
    baseUrl: overrides.baseUrl,
    userDataDir: overrides.userDataDir ?? tempUserDataDir(),
    safeStorage: overrides.safeStorage ?? fakeSafeStorage(true),
    openExternal: overrides.openExternal ?? completingBrowser(),
    reservePort,
    isSafeUrl: isSafeExternalUrl,
  });
}

/** Build a fresh session against the same `userDataDir`/`safeStorage`,
 * simulating an app relaunch. */
function relaunch({ baseUrl, userDataDir, safeStorage }) {
  return createSignInSession({
    baseUrl,
    userDataDir,
    safeStorage,
    openExternal: completingBrowser(),
    reservePort,
    isSafeUrl: isSafeExternalUrl,
  });
}

module.exports = {
  fakeSafeStorage,
  tempUserDataDir,
  fakeHubApi,
  completingBrowser,
  session,
  relaunch,
};
