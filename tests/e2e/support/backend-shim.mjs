#!/usr/bin/env node
/**
 * Stand-in for the frozen backend binary, used by the Electron suite.
 *
 * `desktop/main.cjs` spawns `SPIKEFORGE_BACKEND_EXECUTABLE` in development
 * exactly as it spawns the PyInstaller binary in a packaged build: same
 * arguments, same environment, same stdio and shutdown handling. Pointing that
 * variable at this script exercises all of that supervision logic without a
 * twenty-minute PyInstaller freeze, and the Python it runs is the same
 * `desktop/backend_entry.py` the real binary is frozen from.
 *
 * Two test affordances are layered on top:
 *
 * 1. The launch is recorded to `SPIKEFORGE_E2E_LAUNCH_RECORD` so a spec can
 *    assert what Electron actually passed -- the ephemeral port, the per-user
 *    data directory, the dashboard bundle -- instead of inferring it.
 * 2. The dataset cache is linked into Electron's data directory, so the
 *    desktop run shares the browser run's MNIST download. The data directory
 *    itself is left exactly where Electron put it, so the plumbing under test
 *    is still the real one.
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { CACHE_DIR, REPO_ROOT, SOURCE, CORE_REPO, venvPython } from "./env.mjs";

const args = process.argv.slice(2);
const dataDir = process.env.SPIKEFORGE_DATA_DIR ?? "";

/** Cache entries that are this suite's bookkeeping, not downloaded data. */
const NOT_A_DATASET = new Set(["state", "hub"]);

/**
 * Link the browser run's downloaded datasets into Electron's data directory.
 *
 * Each dataset loader names its own directory (torchvision uses `MNIST`), so
 * this links whatever the cache actually holds rather than guessing names.
 */
function shareCachedDatasets() {
  if (!dataDir || !existsSync(CACHE_DIR)) return;
  mkdirSync(dataDir, { recursive: true });
  for (const entry of readdirSync(CACHE_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || NOT_A_DATASET.has(entry.name)) continue;
    const destination = path.join(dataDir, entry.name);
    if (existsSync(destination)) continue;
    try {
      symlinkSync(path.join(CACHE_DIR, entry.name), destination, "dir");
    } catch {
      // A failed link only costs a re-download; never fail the launch for it.
    }
  }
}

shareCachedDatasets();

const record = process.env.SPIKEFORGE_E2E_LAUNCH_RECORD;
if (record) {
  writeFileSync(
    record,
    JSON.stringify(
      {
        args,
        dataDir,
        dashboardDist: process.env.SPIKEFORGE_DASHBOARD_DIST ?? null,
        unbuffered: process.env.PYTHONUNBUFFERED ?? null,
        pid: process.pid,
      },
      null,
      2,
    ),
  );
}

const child = spawn(
  venvPython(),
  [path.join(REPO_ROOT, "desktop", "backend_entry.py"), ...args],
  {
    cwd: SOURCE === "local" ? CORE_REPO : REPO_ROOT,
    env: process.env,
    stdio: "inherit",
  },
);

// Electron stops the backend with SIGTERM and escalates to SIGKILL. Forward
// both, or the Python process would outlive the window and hold the port.
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
