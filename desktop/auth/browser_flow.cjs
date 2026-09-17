/**
 * One loopback PKCE round trip (RFC 8252): reserve a port, send the system
 * browser to the authorize URL, catch the redirect, and exchange the code.
 *
 * `reservePort` and `openExternal` are injected so this stays testable with
 * `node --test`: a fake `openExternal` can hit the loopback listener itself
 * instead of a real browser, and a fake hub-api stands in for the token
 * exchange. See `sign_in_session.cjs` for how the real Electron
 * dependencies (`shell.openExternal`, the shared `reservePort`) are wired in.
 */

const pkce = require("./pkce.cjs");
const oauthClient = require("./oauth_client.cjs");
const { waitForLoopbackCallback } = require("./loopback_server.cjs");

const HOST = "127.0.0.1";

/**
 * Run the flow to completion and return the exchanged token pair.
 *
 * Never opens an in-app window -- the caller's `openExternal` is expected to
 * hand the URL to the system browser, so the user signs in on a URL bar they
 * can actually inspect.
 */
async function runBrowserSignIn({
  baseUrl,
  clientId,
  reservePort,
  openExternal,
  isSafeUrl,
  signal,
}) {
  const port = await reservePort(HOST);
  const state = pkce.generateState();
  const { verifier, challenge } = pkce.generatePkce();
  const redirectUri = `http://${HOST}:${port}/callback`;
  const authorizeUrl = oauthClient.buildAuthorizeUrl({
    baseUrl,
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  if (!isSafeUrl(authorizeUrl)) {
    // Checked before the listener ever binds: there is nothing to clean up
    // on this path, and no server is left listening forever.
    throw new Error("refusing to open a non-web sign-in URL");
  }

  const waiting = waitForLoopbackCallback(port, { host: HOST, signal });
  await openExternal(authorizeUrl);

  const { code, state: returnedState } = await waiting;
  if (returnedState !== state) {
    throw new Error("sign-in response did not match the request; try again");
  }
  return oauthClient.exchangeAuthorizationCode({
    baseUrl,
    clientId,
    redirectUri,
    code,
    verifier,
  });
}

module.exports = { runBrowserSignIn };
