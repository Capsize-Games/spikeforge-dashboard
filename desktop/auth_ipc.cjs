/**
 * Wires the hub sign-in session (`auth/sign_in_session.cjs`) to the
 * renderer over the `contextBridge` channel `preload.cjs` exposes as
 * `window.spikeforgeAuth`.
 *
 * Kept out of `main.cjs` so the startup sequence there stays readable --
 * the same reasoning as `main_window.cjs`.
 */

const { app, ipcMain, safeStorage, shell } = require("electron");

const { createSignInSession } = require("./auth/sign_in_session.cjs");
const { reservePort, isSafeExternalUrl } = require("./main_helpers.cjs");
const { logDesktop } = require("./desktop_log.cjs");

const HUB_BASE_URL =
  process.env.SPIKEFORGE_HUB_BASE_URL || "https://hub.spikeforge.net";

let session = null;

function getSession() {
  if (!session) {
    session = createSignInSession({
      baseUrl: HUB_BASE_URL,
      userDataDir: app.getPath("userData"),
      safeStorage,
      openExternal: (url) => shell.openExternal(url),
      reservePort,
      isSafeUrl: isSafeExternalUrl,
    });
  }
  return session;
}

/**
 * Register every `auth:*` handler and start restoring a persisted session
 * in the background. `getWindow` is called lazily on each push so this does
 * not care whether the window has been (re)created since.
 */
function registerAuthIpc(getWindow) {
  const s = getSession();
  const send = (channel, payload) =>
    getWindow()?.webContents.send(channel, payload);

  s.onStateChanged((state) => send("auth:state-changed", state));

  ipcMain.handle("auth:get-state", () => s.getState());

  ipcMain.handle("auth:sign-in-browser", async () => {
    await s.signInWithBrowser();
    return s.getState();
  });
  ipcMain.handle("auth:cancel-browser", () => s.cancelBrowserSignIn());

  ipcMain.handle("auth:start-device-code", async () => {
    const started = await s.startDeviceCodeSignIn((status) =>
      send("auth:device-code-status", status),
    );
    // `deviceCode` is what main polls with; the renderer only ever needs
    // what it shows the user.
    return {
      userCode: started.userCode,
      verificationUri: started.verificationUri,
      verificationUriComplete: started.verificationUriComplete,
      expiresIn: started.expiresIn,
    };
  });
  ipcMain.handle("auth:cancel-device-code", () => s.cancelDeviceCodeSignIn());

  ipcMain.handle("auth:sign-in-pat", async (_event, token) => {
    await s.signInWithPat(token);
    return s.getState();
  });

  ipcMain.handle("auth:sign-out", () => {
    s.signOut();
    return s.getState();
  });

  s.restore().catch((error) =>
    logDesktop(`hub session restore failed: ${error.message}`),
  );
}

module.exports = { registerAuthIpc, HUB_BASE_URL };
