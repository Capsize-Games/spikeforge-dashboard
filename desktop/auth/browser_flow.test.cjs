const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { reservePort, isSafeExternalUrl } = require("../main_helpers.cjs");
const { runBrowserSignIn } = require("./browser_flow.cjs");

/** A throwaway hub-api that hands back a fixed token pair for any code. */
async function fakeHubApi() {
  const port = await reservePort();
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          access_token: "sfh_at_1",
          refresh_token: "sfh_rt_1",
          expires_in: 3600,
          scope: "models:read",
        }),
      );
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/** A fake "system browser": instead of opening a window, it immediately
 * calls back the redirect URI with a code, carrying over whatever `state`
 * the authorize URL asked for. */
function completingBrowser() {
  return (authorizeUrl) => {
    const url = new URL(authorizeUrl);
    const redirectUri = new URL(url.searchParams.get("redirect_uri"));
    redirectUri.searchParams.set("code", "the-code");
    redirectUri.searchParams.set("state", url.searchParams.get("state"));
    return new Promise((resolve, reject) => {
      http.get(redirectUri, (response) => {
        response.resume();
        response.on("end", resolve);
      }).on("error", reject);
    });
  };
}

test("completes a full loopback round trip and returns the token pair", async () => {
  const api = await fakeHubApi();
  try {
    const pair = await runBrowserSignIn({
      baseUrl: api.baseUrl,
      clientId: "spikeforge-desktop",
      reservePort,
      openExternal: completingBrowser(),
      isSafeUrl: isSafeExternalUrl,
    });
    assert.equal(pair.accessToken, "sfh_at_1");
    assert.equal(pair.refreshToken, "sfh_rt_1");
  } finally {
    api.close();
  }
});

test("refuses to open a URL that is not http(s)", async () => {
  await assert.rejects(
    runBrowserSignIn({
      baseUrl: "https://hub.spikeforge.net",
      clientId: "spikeforge-desktop",
      reservePort,
      openExternal: async () => {
        throw new Error("should never be called");
      },
      isSafeUrl: () => false,
    }),
    /refusing to open/,
  );
});

test("rejects when the returned state does not match what was sent", async () => {
  const api = await fakeHubApi();
  try {
    const wrongState = (authorizeUrl) => {
      const url = new URL(authorizeUrl);
      const redirectUri = new URL(url.searchParams.get("redirect_uri"));
      redirectUri.searchParams.set("code", "the-code");
      redirectUri.searchParams.set("state", "not-the-real-state");
      return new Promise((resolve, reject) => {
        http.get(redirectUri, (response) => {
          response.resume();
          response.on("end", resolve);
        }).on("error", reject);
      });
    };
    await assert.rejects(
      runBrowserSignIn({
        baseUrl: api.baseUrl,
        clientId: "spikeforge-desktop",
        reservePort,
        openExternal: wrongState,
        isSafeUrl: isSafeExternalUrl,
      }),
      /did not match/,
    );
  } finally {
    api.close();
  }
});

test("cancelling the signal stops the wait for the browser", async () => {
  const controller = new AbortController();
  const promise = runBrowserSignIn({
    baseUrl: "https://hub.spikeforge.net",
    clientId: "spikeforge-desktop",
    reservePort,
    openExternal: async () => controller.abort(),
    isSafeUrl: isSafeExternalUrl,
    signal: controller.signal,
  });
  await assert.rejects(promise, /cancelled/);
});
