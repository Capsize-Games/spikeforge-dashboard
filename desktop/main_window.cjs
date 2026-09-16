/**
 * The application's single window.
 *
 * Kept out of `main.cjs` so the startup sequence there stays readable, and
 * because the one decision this file makes -- when the window becomes
 * visible -- is the difference between an application that appears and one
 * that runs invisibly forever.
 */

const { BrowserWindow, shell } = require("electron");
const path = require("node:path");

const { isSafeExternalUrl } = require("./main_helpers.cjs");
const { logDesktop } = require("./desktop_log.cjs");
const { pageUrl, startingPage } = require("./startup_page.cjs");

/**
 * Create the window, already on screen, showing the startup page.
 *
 * `localOrigin` is the only address the window is allowed to navigate to on
 * its own; anything else is handed to the user's browser.
 */
function createWindow(localOrigin) {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0d1117",
    // Shown immediately rather than on `ready-to-show`. That event only fires
    // once the renderer has painted, and when it does not fire -- a wedged GPU
    // process is the usual reason on Windows -- the window is never shown at
    // all: the application runs, appears in the task list, and displays
    // nothing, forever. `backgroundColor` is what the empty window shows in
    // the meantime, so there is no white flash to avoid.
    show: true,
    title: "SpikeForge Desktop",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(localOrigin)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) shell.openExternal(url);
    }
  });
  window.webContents.on("render-process-gone", (_event, details) =>
    logDesktop(`renderer gone: ${JSON.stringify(details)}`),
  );

  logDesktop(
    `window created: visible=${window.isVisible()} ` +
      `bounds=${JSON.stringify(window.getBounds())}`,
  );
  // Loaded after the window exists, so a load that never finishes still
  // leaves a visible window rather than nothing.
  window.loadURL(pageUrl(startingPage()));
  return window;
}

module.exports = { createWindow };
