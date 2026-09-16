/**
 * Paths, ports, and directories shared by the end-to-end harness.
 *
 * Both the Playwright config and the server runner import this, so there is
 * one place that decides where the backend lives and which directories it is
 * allowed to write to.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root of the dashboard checkout. */
export const REPO_ROOT = path.resolve(here, "..", "..", "..");

/** The built dashboard the server serves; the suite tests production output. */
export const DIST_DIR = path.join(REPO_ROOT, "dist");

/**
 * Datasets and hub artifacts, kept across runs so a suite costs one MNIST
 * download rather than one per invocation.
 */
export const CACHE_DIR = path.join(REPO_ROOT, ".e2e-data");

/**
 * Checkpoints, pipelines, and registries the tests themselves create. Wiped
 * at server start so a run never inherits another run's saved state.
 */
export const STATE_DIR = path.join(CACHE_DIR, "state");


/** Where `--source local` looks for a core-repository checkout. */
export const CORE_REPO =
  process.env.SPIKEFORGE_E2E_REPO ??
  path.resolve(REPO_ROOT, "..", "spikeforge");

/** `pypi` runs the pinned release combination; `local` runs a checkout. */
export const SOURCE = process.env.SPIKEFORGE_E2E_SOURCE ?? "pypi";

/** Kept off 8877 so a suite never collides with a running `npm run dev`. */
export const PORT = Number(process.env.SPIKEFORGE_E2E_PORT ?? 8899);

export const BASE_URL = `http://127.0.0.1:${PORT}`;

/** The virtual environment `scripts/provision_e2e_backend.py` builds. */
export const VENV_DIR =
  process.env.SPIKEFORGE_E2E_VENV ?? path.join(REPO_ROOT, ".venv-e2e");

/** Interpreter inside the provisioned environment. */
export function venvPython() {
  const name =
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python";
  return path.join(VENV_DIR, ...name.split("/"));
}

/**
 * Return the environment a SpikeForge server runs under for the suite.
 *
 * Datasets stay in the shared cache while everything the tests write is
 * redirected into `dataDir`, which lets the Electron backend share one MNIST
 * download with the browser backend without sharing its saved checkpoints.
 */
export function serverEnv({ dataDir = CACHE_DIR, stateDir = STATE_DIR } = {}) {
  return {
    PYTHONUNBUFFERED: "1",
    SPIKEFORGE_DATA_DIR: dataDir,
    SPIKEFORGE_DASHBOARD_DIST: DIST_DIR,
    SPIKEFORGE_MODEL_DIR: path.join(stateDir, "models"),
    SPIKEFORGE_PIPELINES_DIR: path.join(stateDir, "pipelines"),
    SPIKEFORGE_REGISTRY_DIR: path.join(stateDir, "registry"),
    SPIKEFORGE_METRICS_DIR: path.join(stateDir, "metrics"),
    SPIKEFORGE_TRACKING_DIR: path.join(stateDir, "tracking"),
    // The hub cache is a download cache like the datasets, so it is shared.
    SPIKEFORGE_HUB_DIR: path.join(CACHE_DIR, "hub"),
  };
}

/** Create the shared cache and give the run an empty state directory. */
export function resetState(stateDir = STATE_DIR) {
  mkdirSync(CACHE_DIR, { recursive: true });
  rmSync(stateDir, { recursive: true, force: true });
  mkdirSync(stateDir, { recursive: true });
}

/** True when the dashboard has been built at least once. */
export function distIsBuilt() {
  return existsSync(path.join(DIST_DIR, "index.html"));
}
