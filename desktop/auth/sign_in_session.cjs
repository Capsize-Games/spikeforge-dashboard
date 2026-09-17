/**
 * Orchestrates the hub sign-in session: the loopback PKCE flow, the
 * device-code fallback, pasting a PAT, restoring a session at launch, and
 * signing out.
 *
 * `safeStorage` and `shell` are injected (never `require("electron")`
 * directly), so this whole module -- unlike `main.cjs` -- is exercised by
 * `node --test` with fakes standing in for the OS keyring and the browser.
 * `sign_in_session.test.cjs` runs full loopback and device-code round trips
 * against a throwaway hub-api, including the `isEncryptionAvailable() ===
 * false` path this issue calls out by name.
 *
 * The access token never leaves this module except over the
 * `contextBridge` channel to the renderer that asked for it (`auth_ipc.cjs`
 * wires that up); it is never written to disk. Only a refresh token or a
 * pasted PAT is persisted, and only via `credential_store`, which itself
 * refuses to write anything when `safeStorage.isEncryptionAvailable()` is
 * false.
 */

const path = require("node:path");

const credentialStore = require("./credential_store.cjs");
const oauthClient = require("./oauth_client.cjs");
const { runBrowserSignIn } = require("./browser_flow.cjs");
const { createDeviceCodePoller } = require("./device_code_flow.cjs");

const CLIENT_ID = "spikeforge-desktop";
//: A code, not a sentence -- the renderer owns the user-facing (and
//: translated) wording for it, in `src/i18n/translations.ts`'s
//: `auth.notPersisted` key. Keeping prose out of the main process is what
//: lets this string reach every locale the dashboard supports.
const NO_SECURE_STORAGE = "no_secure_storage";

/**
 * Build a session bound to one hub deployment, one `userData` directory,
 * and the platform primitives it needs: `safeStorage`, `shell.openExternal`,
 * `reservePort`, and `isSafeUrl` (all satisfied by real Electron APIs and
 * `main_helpers.cjs` in production; by fakes in tests).
 */
function createSignInSession({
  baseUrl,
  userDataDir,
  safeStorage,
  openExternal,
  reservePort,
  isSafeUrl,
}) {
  const authDir = path.join(userDataDir, "auth");
  const listeners = new Set();
  let state = signedOutState();
  let browserAbort = null;
  let devicePoller = null;

  function signedOutState(warning = null) {
    return {
      status: "signed-out",
      accessToken: null,
      handle: null,
      displayName: null,
      persistent: false,
      warning,
    };
  }

  function publicState() {
    const { status, handle, displayName, persistent, warning } = state;
    return { status, handle, displayName, persistent, warning };
  }

  function publish() {
    for (const listener of listeners) listener(publicState());
  }

  function onStateChanged(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function setSignedIn({ accessToken, handle, displayName, warning }) {
    state = {
      status: "signed-in",
      accessToken,
      handle,
      displayName,
      persistent: warning === null,
      warning,
    };
    publish();
  }

  function setSignedOut(warning = null) {
    state = signedOutState(warning);
    publish();
  }

  /** Persist `credential` if possible; return a warning string instead of
   * ever writing it in plaintext when there is no secure storage. */
  function persist(credential) {
    if (!credentialStore.isEncryptionAvailable(safeStorage)) {
      return NO_SECURE_STORAGE;
    }
    credentialStore.saveCredential(safeStorage, authDir, credential);
    return null;
  }

  async function completeWithPair(pair) {
    const profile = await oauthClient.fetchProfile({
      baseUrl,
      accessToken: pair.accessToken,
    });
    const warning = persist({
      kind: "refresh_token",
      value: pair.refreshToken,
    });
    setSignedIn({ accessToken: pair.accessToken, ...profile, warning });
  }

  /** Restore a session from a previously stored credential, at launch. Never
   * throws: a session that cannot be restored is simply a signed-out one. */
  async function restore() {
    const credential = credentialStore.loadCredential(safeStorage, authDir);
    if (!credential) return;
    try {
      if (credential.kind === "pat") {
        const profile = await oauthClient.fetchProfile({
          baseUrl,
          accessToken: credential.value,
        });
        setSignedIn({
          accessToken: credential.value,
          ...profile,
          warning: null,
        });
        return;
      }
      const pair = await oauthClient.refreshSession({
        baseUrl,
        refreshToken: credential.value,
      });
      await completeWithPair(pair);
    } catch {
      // A revoked or expired credential is not an error to surface loudly --
      // it is exactly what "signed out until you sign in again" looks like.
      credentialStore.clearCredential(authDir);
      setSignedOut();
    }
  }

  async function signInWithBrowser() {
    browserAbort = new AbortController();
    try {
      const pair = await runBrowserSignIn({
        baseUrl,
        clientId: CLIENT_ID,
        reservePort,
        openExternal,
        isSafeUrl,
        signal: browserAbort.signal,
      });
      await completeWithPair(pair);
    } finally {
      browserAbort = null;
    }
  }

  function cancelBrowserSignIn() {
    browserAbort?.abort();
  }

  /** Start the device-code fallback. Returns the code to show at once; the
   * polling that follows reports through `onStatus`. */
  async function startDeviceCodeSignIn(onStatus) {
    const started = await oauthClient.startDeviceCode({
      baseUrl,
      clientId: CLIENT_ID,
    });
    devicePoller = createDeviceCodePoller({ baseUrl, clientId: CLIENT_ID });
    devicePoller
      .poll(started, async (result) => {
        if (result.status === "granted") {
          await completeWithPair(result.pair);
          onStatus({ status: "granted" });
        } else {
          onStatus(result);
        }
      })
      .catch((error) => onStatus({ status: "error", message: error.message }));
    return started;
  }

  function cancelDeviceCodeSignIn() {
    devicePoller?.cancel();
  }

  /** Accept a pasted personal access token: validate it by using it, then
   * store it exactly like a refresh token (same no-keyring rule applies). */
  async function signInWithPat(token) {
    const value = token.trim();
    const profile = await oauthClient.fetchProfile({
      baseUrl,
      accessToken: value,
    });
    const warning = persist({ kind: "pat", value });
    setSignedIn({ accessToken: value, ...profile, warning });
  }

  function signOut() {
    credentialStore.clearCredential(authDir);
    setSignedOut();
  }

  return {
    getState: publicState,
    onStateChanged,
    restore,
    signInWithBrowser,
    cancelBrowserSignIn,
    startDeviceCodeSignIn,
    cancelDeviceCodeSignIn,
    signInWithPat,
    signOut,
  };
}

module.exports = { createSignInSession, CLIENT_ID };
