const { app } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const {
  backendFilename,
  hasExited,
  reservePort,
} = require("./main_helpers.cjs");
const { failedPage, pageUrl } = require("./startup_page.cjs");
const { createWindow } = require("./main_window.cjs");
const { logDesktop } = require("./desktop_log.cjs");
const { registerAuthIpc } = require("./auth_ipc.cjs");

const HOST = "127.0.0.1";
const HEALTH_TIMEOUT_MS = 120_000;
const HEALTH_INTERVAL_MS = 350;
const SHUTDOWN_TIMEOUT_MS = 5_000;

let backend = null;
let mainWindow = null;
let quitting = false;
let backendLog = null;
/** How the engine stopped, once it has, so polling can give up at once. */
let backendStopped = null;
/** True once the window is showing the dashboard rather than a status page. */
let serving = false;

function resourcePath(...parts) {
  const root = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "runtime");
  return path.join(root, ...parts);
}

function spawnBackend(port) {
  const executable = app.isPackaged
    ? resourcePath("backend", backendFilename())
    : process.env.SPIKEFORGE_BACKEND_EXECUTABLE;

  if (!executable || !fs.existsSync(executable)) {
    throw new Error(
      app.isPackaged
        ? `The packaged backend is missing: ${executable}`
        : "Set SPIKEFORGE_BACKEND_EXECUTABLE to a built backend before running desktop:dev.",
    );
  }

  const userData = app.getPath("userData");
  const dataDir = path.join(userData, "data");
  const logDir = path.join(userData, "logs");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  backendLog = path.join(logDir, "backend.log");
  const logStream = fs.createWriteStream(backendLog, { flags: "a" });
  logStream.write(`\n--- SpikeForge Desktop ${new Date().toISOString()} ---\n`);

  const child = spawn(executable, ["--host", HOST, "--port", String(port)], {
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      SPIKEFORGE_DATA_DIR: dataDir,
      SPIKEFORGE_DASHBOARD_DIST: app.isPackaged
        ? resourcePath("web")
        : path.join(__dirname, "..", "dist"),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });
  child.on("error", (error) => logStream.write(`\nspawn error: ${error.stack}\n`));
  child.on("exit", (code, signal) => {
    logStream.write(`\nbackend exited: code=${code} signal=${signal}\n`);
    logStream.end();
    if (backend === child) backend = null;
    backendStopped = { code, signal };
    // While starting, `waitForHealth` turns this into the reported failure.
    // Once the dashboard is on screen nothing else is watching, so the window
    // has to be told here instead.
    if (!quitting && code !== 0 && serving) {
      showFailure(
        `The engine stopped unexpectedly (exit code ${code ?? "unknown"}).`,
      );
    }
  });
  return child;
}

function waitForHealth(port) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const poll = () => {
      // An engine that has already stopped is never going to answer, and
      // waiting out the full timeout only delays telling the user why.
      if (backendStopped) {
        const { code } = backendStopped;
        reject(
          new Error(
            `The engine stopped before it was ready ` +
              `(exit code ${code ?? "unknown"}).`,
          ),
        );
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("The SpikeForge engine did not become ready within two minutes."));
        return;
      }
      const request = http.get({ host: HOST, port, path: "/health", timeout: 2000 }, (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else setTimeout(poll, HEALTH_INTERVAL_MS);
      });
      request.on("timeout", () => request.destroy());
      request.on("error", () => setTimeout(poll, HEALTH_INTERVAL_MS));
    };
    poll();
  });
}

/** Open the window and keep `mainWindow` honest about its lifetime. */
function openWindow(port) {
  const window = createWindow(`http://${HOST}:${port}`);
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  return window;
}

/**
 * Report a failed start in the window, rather than in a modal.
 *
 * The window stays open afterwards so the message and the log path can be
 * read and copied. Quitting is left to the user.
 */
function showFailure(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  serving = false;
  mainWindow.loadURL(pageUrl(failedPage(message, backendLog)));
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

async function stopBackend() {
  const child = backend;
  backend = null;
  if (!child || hasExited(child)) return;

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    child.once("exit", finish);
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
      }).once("exit", finish);
    } else {
      child.kill("SIGTERM");
    }
    // Deliberately not unref'd: this timer is the only escape when the child
    // never reports an exit, and an unref'd timer does not hold the event
    // loop open. Quitting would then wait on a promise nothing can settle.
    setTimeout(() => {
      if (process.platform !== "win32" && !hasExited(child)) {
        child.kill("SIGKILL");
      }
      finish();
    }, SHUTDOWN_TIMEOUT_MS);
  });
}

async function start() {
  // Recorded because a wedged or blacklisted GPU is the usual reason a window
  // never paints, and it is invisible from anywhere else.
  logDesktop(`gpu: ${JSON.stringify(app.getGPUFeatureStatus())}`);
  // Independent of the local engine below: sign-in should work (and a
  // restored session should show up) even on a run where the backend never
  // becomes healthy.
  registerAuthIpc(() => mainWindow);
  const port = await reservePort(HOST);
  // The window comes first so there is something on screen for the whole of
  // startup, including when startup is what fails.
  mainWindow = openWindow(port);
  try {
    backend = spawnBackend(port);
    await waitForHealth(port);
    serving = true;
    mainWindow.loadURL(`http://${HOST}:${port}`);
  } catch (error) {
    showFailure(error instanceof Error ? error.message : String(error));
  }
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  // Reserving a port or constructing the window can fail before `start` has
  // anywhere to report to, and an unhandled rejection there would take the
  // application down with no window and no message -- the exact failure this
  // startup path exists to remove.
  app.whenReady()
    .then(start)
    .catch((error) => {
      if (!mainWindow) mainWindow = openWindow(0);
      showFailure(error instanceof Error ? error.message : String(error));
    });
}

app.on("window-all-closed", () => app.quit());

app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  stopBackend().finally(() => app.quit());
});
