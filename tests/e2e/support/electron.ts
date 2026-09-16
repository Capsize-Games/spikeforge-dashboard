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
  /** Process id of the backend Electron spawned. */
  pid: number;
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
  // The window is only created after `/health` answers, so waiting for it is
  // also the assertion that the backend came up.
  await app.firstWindow({ timeout });

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
 * `app.close()` waits for Electron to quit of its own accord, which is the
 * behaviour `specs/electron/shell.spec.ts` asserts explicitly. Here the point
 * is only to clean up after a worker, so a quit that stalls must not be able
 * to fail an otherwise-passing run: past the deadline the process is killed,
 * and the backend it supervised is killed with it so no orphan holds a port.
 */
export async function closeDesktopApp(launch: DesktopLaunch): Promise<void> {
  const electron = launch.app.process();
  const stalled = Symbol("stalled");
  const outcome = await Promise.race([
    launch.app.close().then(() => "closed" as const),
    new Promise<typeof stalled>((resolve) =>
      setTimeout(() => resolve(stalled), CLOSE_TIMEOUT_MS),
    ),
  ]);
  if (outcome !== stalled) return;

  console.warn(
    `desktop app did not quit within ${CLOSE_TIMEOUT_MS}ms; killing it`,
  );
  for (const pid of [electron.pid, readBackendPid(launch)]) {
    if (pid === undefined) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone, which is the outcome this is reaching for anyway.
    }
  }
}

/** The supervised backend's process id, when the shim recorded one. */
function readBackendPid(launch: DesktopLaunch): number | undefined {
  try {
    return launch.readRecord().pid;
  } catch {
    return undefined;
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
