/**
 * Preload script: the one bridge between the renderer (the same dashboard
 * bundle the browser build serves) and the sign-in session living in the
 * Electron main process.
 *
 * `contextIsolation`/`sandbox` are on for the main window (`main_window.cjs`),
 * so `window.spikeforgeAuth` is the only way the page reaches any of this --
 * everything else about hub sign-in (PKCE, `safeStorage`, `shell.openExternal`)
 * stays in main, out of the renderer's reach.
 */

const { contextBridge, ipcRenderer } = require("electron");

const CHANNEL = {
  getState: "auth:get-state",
  stateChanged: "auth:state-changed",
  signInBrowser: "auth:sign-in-browser",
  cancelBrowser: "auth:cancel-browser",
  startDeviceCode: "auth:start-device-code",
  deviceCodeStatus: "auth:device-code-status",
  cancelDeviceCode: "auth:cancel-device-code",
  signInPat: "auth:sign-in-pat",
  signOut: "auth:sign-out",
};

/** Wrap an `ipcRenderer.on` subscription as an `(callback) => unsubscribe`
 * pair, the shape every hook in `src/hooks/useAuth.ts` expects. */
function subscription(channel) {
  return (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld("spikeforgeAuth", {
  getState: () => ipcRenderer.invoke(CHANNEL.getState),
  signInWithBrowser: () => ipcRenderer.invoke(CHANNEL.signInBrowser),
  cancelBrowserSignIn: () => ipcRenderer.invoke(CHANNEL.cancelBrowser),
  startDeviceCode: () => ipcRenderer.invoke(CHANNEL.startDeviceCode),
  cancelDeviceCode: () => ipcRenderer.invoke(CHANNEL.cancelDeviceCode),
  signInWithPat: (token) => ipcRenderer.invoke(CHANNEL.signInPat, token),
  signOut: () => ipcRenderer.invoke(CHANNEL.signOut),
  onStateChanged: subscription(CHANNEL.stateChanged),
  onDeviceCodeStatus: subscription(CHANNEL.deviceCodeStatus),
});
