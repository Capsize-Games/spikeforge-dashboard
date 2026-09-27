/**
 * Launching SpikeForge Desktop under test.
 *
 * `desktop/main.cjs` treats a development launch exactly as it treats a
 * packaged one: it reserves an ephemeral port, spawns the backend executable,
 * polls `/health`, and only then opens the window. Pointing
 * `SPIKEFORGE_BACKEND_EXECUTABLE` at the shim in this directory exercises all
 * of that against the same Python entry point the real binary is frozen from.
 */

import { _electron } from "@playwright/test";
import type { ElectronApplication } from "@playwright/test";
import { chmodSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { REPO_ROOT } from "./env.mjs";

const SHIM = path.join(
  REPO_ROOT,
  "tests",
  "e2e",
  "support",
  "backend-shim.mjs",
);

/** What Electron passed to the backend process it spawned. */
export interface LaunchRecord {
  args: string[];
  dataDir: string;
  dashboardDist: string | null;
  unbuffered: string | null;
  /** Process id of the backend Electron spawned (the shim). */
  pid: number;
  /** Process id of the Python process the shim spawned, when it recorded one. */
  backendPid: number | null;
}

export interface DesktopLaunch {
  app: ElectronApplication;
  /** Path the shim writes its launch record to. */
  recordPath: string;
  /** Read the record the shim wrote when Electron spawned it. */
  readRecord(): LaunchRecord;
}

/** How long a graceful quit is given before the process is killed outright. */
const CLOSE_TIMEOUT_MS = 30_000;

/**
 * Variables that make the Electron binary behave as plain Node.
 *
 * A VS Code integrated terminal exports `ELECTRON_RUN_AS_NODE=1` for its own
 * child processes. Inheriting it turns the launch into a Node process that
 * rejects Electron's own switches, so the suite would fail for a reason that
 * has nothing to do with the application.
 */
const NODE_MODE_VARS = ["ELECTRON_RUN_AS_NODE", "ELECTRON_NO_ATTACH_CONSOLE"];

/** The parent environment with the Node-mode switches removed. */
function desktopEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !NODE_MODE_VARS.includes(key)) env[key] = value;
  }
  return env;
}

/**
 * Launch the desktop application with an isolated profile.
 *
 * `--user-data-dir` keeps each run's checkpoints, window state, and backend
 * log out of the developer's real SpikeForge Desktop profile.
 */
export async function launchDesktopApp(
  label: string,
  timeout = 180_000,
): Promise<DesktopLaunch> {
  // The shim is checked in, so its executable bit depends on how the tree was
  // cloned. Electron's `existsSync` check does not care, but the spawn does.
  chmodSync(SHIM, 0o755);
  const scratch = mkdtempSync(path.join(tmpdir(), `spikeforge-e2e-${label}-`));
  const recordPath = path.join(scratch, "launch.json");

  const app = await _electron.launch({
    args: [REPO_ROOT, `--user-data-dir=${path.join(scratch, "profile")}`],
    env: {
      ...desktopEnv(),
      SPIKEFORGE_BACKEND_EXECUTABLE: SHIM,
      SPIKEFORGE_E2E_LAUNCH_RECORD: recordPath,
    },
  });
  // The window opens immediately on a startup page, so its existence no
  // longer says anything about the engine. The navigation to the local
  // server is what proves `/health` answered; on a failed start the window
  // stays on a `data:` URL and this times out with the window's own message.
  const window = await app.firstWindow({ timeout });
  await window.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout });

  return {
    app,
    recordPath,
    readRecord: () =>
      JSON.parse(readFileSync(recordPath, "utf8")) as LaunchRecord,
  };
}

/**
 * Shut a launched application down, and make sure it is really gone.
 *
 * The shell spec exercises Playwright's graceful `app.close()` path directly.
 * Worker cleanup has a different requirement: it must not leave an unresolved
 * Playwright close request holding the worker open after the tests pass. Send
 * a bounded OS-level termination to the process tree instead, then escalate
 * to SIGKILL so the backend cannot orphan a port or inherited stdio pipe.
 */
export async function closeDesktopApp(launch: DesktopLaunch): Promise<void> {
  // Keep Playwright's own ChildProcess handle. Killing the numeric pid leaves
  // the ElectronApplication server waiting for the handle's close event.
  const electronProcess = launch.app.process();
  const pids = [electronProcess.pid, ...recordedPids(launch)]
    .filter((pid): pid is number => pid !== undefined && pid !== null);
  const electronPid = electronProcess.pid;
  if (electronPid !== undefined) {
    try {
      electronProcess.kill("SIGTERM");
    } catch {
      // Already gone, which is the outcome this is reaching for anyway.
    }
  }

  const deadline = Date.now() + CLOSE_TIMEOUT_MS;
  while (pids.some(isRunning) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (pids.some(isRunning)) {
    console.warn(
      `desktop app did not quit within ${CLOSE_TIMEOUT_MS}ms; killing it`,
    );
  }
  // Kill the whole tree, not just Electron. The shim spawns Python as a
  // grandchild, so killing the shim alone orphans a process that goes on
  // holding its port and the inherited stdio pipes.
  for (const pid of pids) {
    if (!isRunning(pid)) continue;
    try {
      if (pid === electronPid) electronProcess.kill("SIGKILL");
      else process.kill(pid, "SIGKILL");
    } catch {
      // Already gone, which is the outcome this is reaching for anyway.
    }
  }

  // Once the owned process has exited, let Playwright close its Electron
  // application channel. Calling app.close() before termination can block in
  // Playwright's graceful quit handler when the worker is already unwinding.
  await launch.app.close().catch(() => {
    // The process may have been forcibly terminated, so the channel can
    // already be closed by the time this cleanup reaches it.
  });
}

/** The shim's and the backend's process ids, when the shim recorded them. */
function recordedPids(launch: DesktopLaunch): (number | null)[] {
  try {
    const record = launch.readRecord();
    return [record.pid, record.backendPid];
  } catch {
    return [];
  }
}

/**
 * Narrow a fixture that is null outside the Electron project.
 *
 * The `electronApp` and `launchRecord` fixtures are typed nullable because the
 * browser projects share them. A spec under `specs/electron/` only ever runs
 * with them present, and this turns that into a checked assumption rather than
 * a non-null assertion.
 */
export function onlyInElectron<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new Error(`${what} is only available in the electron project`);
  }
  return value;
}

/** True when a process id is still running. */
export function isRunning(pid: number): boolean {
  try {
    // Signal 0 performs the permission and existence checks without
    // delivering anything.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
