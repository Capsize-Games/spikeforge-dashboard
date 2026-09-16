const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const {
  backendFilename,
  hasExited,
  isSafeExternalUrl,
  reservePort,
} = require("./main_helpers.cjs");

const HOST = "127.0.0.1";
const HEALTH_TIMEOUT_MS = 120_000;
const HEALTH_INTERVAL_MS = 350;
const SHUTDOWN_TIMEOUT_MS = 5_000;

let backend = null;
let mainWindow = null;
let quitting = false;
let backendLog = null;

function resourcePath(...parts) {
  const root = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "runtime");
  return path.join(root, ...parts);
}

function openBackendLog() {
  if (backendLog && fs.existsSync(backendLog)) {
    shell.showItemInFolder(backendLog);
  }
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
    if (!quitting && code !== 0) {
      dialog.showMessageBox({
        type: "error",
        title: "SpikeForge backend stopped",
        message: "The local SpikeForge engine stopped unexpectedly.",
        detail: `Exit code: ${code ?? "unknown"}. The backend log contains more information.`,
        buttons: ["Open log", "Quit"],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) openBackendLog();
        app.quit();
      });
    }
  });
  return child;
}

function waitForHealth(port) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const poll = () => {
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

function createWindow(port) {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0d1117",
    show: false,
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
    const localOrigin = `http://${HOST}:${port}`;
    if (!url.startsWith(localOrigin)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) shell.openExternal(url);
    }
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.loadURL(`http://${HOST}:${port}`);
  return window;
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
  try {
    const port = await reservePort(HOST);
    backend = spawnBackend(port);
    await waitForHealth(port);
    mainWindow = createWindow(port);
  } catch (error) {
    const result = await dialog.showMessageBox({
      type: "error",
      title: "SpikeForge could not start",
      message: "SpikeForge Desktop could not start its local engine.",
      detail: error instanceof Error ? error.message : String(error),
      buttons: backendLog ? ["Open log", "Quit"] : ["Quit"],
      defaultId: 0,
    });
    if (backendLog && result.response === 0) openBackendLog();
    app.quit();
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
  app.whenReady().then(start);
}

app.on("window-all-closed", () => app.quit());

app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  stopBackend().finally(() => app.quit());
});
