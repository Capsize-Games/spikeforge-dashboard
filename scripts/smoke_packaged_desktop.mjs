/**
 * Launch a packaged SpikeForge Desktop build and prove a window is on screen.
 *
 * The Electron suite under `tests/e2e/specs/electron/` launches the *source*
 * tree against a Python shim. That covers the supervision logic but never the
 * two things a user actually receives: the frozen backend binary and the
 * packaged resource layout.
 *
 * An earlier version of this script checked only that the engine answered
 * `/health`. That is not the same as the application working, and the
 * difference is not academic: a build whose window is created but never shown
 * passes a health check while the user sees a process in the task list and
 * nothing on screen. So the assertion here is the window -- that one exists,
 * that it is visible, that it has real bounds, and that it ends up showing
 * the dashboard rather than a status page.
 */

import { _electron } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Candidate executable names, in the order electron-builder emits them. */
const EXECUTABLES = [
  "SpikeForge Desktop.exe",
  "SpikeForge Desktop",
  "spikeforge-desktop",
  "spikeforge-dashboard",
];

const START_TIMEOUT_MS = 300_000;

/**
 * Variables that make the Electron binary behave as plain Node.
 *
 * A VS Code integrated terminal exports `ELECTRON_RUN_AS_NODE=1` for its own
 * child processes, and a CI runner started from one inherits it. The packaged
 * binary then reads Electron's own switches as Node options, exits before the
 * first window, and Playwright reports only "Process failed to launch!". The
 * Electron suite strips the same variables in `tests/e2e/support/electron.ts`.
 */
const NODE_MODE_VARS = ["ELECTRON_RUN_AS_NODE", "ELECTRON_NO_ATTACH_CONSOLE"];

/** The parent environment with the Node-mode switches removed. */
function desktopEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !NODE_MODE_VARS.includes(key)) env[key] = value;
  }
  return env;
}

function parseArgs(argv) {
  const args = { app: null, exe: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--app") args.app = argv[i + 1];
    if (argv[i] === "--exe") args.exe = argv[i + 1];
  }
  if (!args.app && !args.exe) {
    throw new Error("usage: smoke_packaged_desktop.mjs --app DIR | --exe PATH");
  }
  return args;
}

/** Resolve the Electron binary inside a packaged application directory. */
function resolveExecutable({ app, exe }) {
  if (exe) {
    if (!existsSync(exe)) throw new Error(`no such executable: ${exe}`);
    return exe;
  }
  for (const name of EXECUTABLES) {
    const candidate = path.join(app, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `no SpikeForge Desktop executable in ${app} ` +
      `(looked for: ${EXECUTABLES.join(", ")})`,
  );
}

/** What the main process can see about its own windows. */
const WINDOW_STATE = ({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().map((window) => ({
    visible: window.isVisible(),
    minimized: window.isMinimized(),
    bounds: window.getBounds(),
    // The startup page is an inlined `data:` URL thousands of characters
    // long, and printing it whole buries every other line of the report.
    url: window.webContents.getURL().slice(0, 60),
  }));

/** Print the logs the application wrote, which say why it failed. */
function report(profile) {
  for (const name of ["desktop.log", "backend.log"]) {
    const file = path.join(profile, "logs", name);
    console.error(`--- ${name} ---`);
    console.error(existsSync(file) ? readFileSync(file, "utf8") : "not written");
  }
}

async function main() {
  const executable = resolveExecutable(parseArgs(process.argv.slice(2)));
  const scratch = mkdtempSync(path.join(tmpdir(), "spikeforge-smoke-"));
  const profile = path.join(scratch, "profile");

  console.log(`launching: ${executable}`);
  const app = await _electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${profile}`],
    env: desktopEnv(),
    timeout: 120_000,
  });

  try {
    const window = await app.firstWindow({ timeout: 120_000 });
    // `firstWindow` resolves for a window that exists. Whether anyone can see
    // it is a separate question, and the one that matters here.
    const [created] = await app.evaluate(WINDOW_STATE);
    console.log(`window: ${JSON.stringify(created)}`);
    if (!created?.visible) {
      throw new Error("the window was created but is not visible");
    }
    if (!created.bounds.width || !created.bounds.height) {
      throw new Error(`the window has no size: ${JSON.stringify(created.bounds)}`);
    }

    // The startup page is a `data:` URL; reaching the local server is what
    // proves the engine came up and the dashboard replaced it.
    await window.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, {
      timeout: START_TIMEOUT_MS,
    });
    const [serving] = await app.evaluate(WINDOW_STATE);
    if (!serving?.visible) {
      throw new Error("the window stopped being visible once the engine came up");
    }
    console.log(`serving: ${serving.url}`);
    console.log("packaged desktop smoke test passed");
  } catch (error) {
    console.error(`\n${error.message}`);
    report(profile);
    // `close()` is known to stall on the shared Electron application, and a
    // failing run must not hang a build machine waiting for it.
    app.process().kill("SIGKILL");
    process.exit(1);
  }

  app.process().kill("SIGKILL");
  process.exit(0);
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exit(1);
});
