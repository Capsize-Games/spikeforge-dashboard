/**
 * Start the SpikeForge server the end-to-end suite runs against.
 *
 * Playwright's `webServer` runs this and waits for `/health`. It deliberately
 * serves the built `dist/` from the same origin as `/ws`, because that is how
 * the dashboard is deployed in Docker and how the desktop application loads
 * it -- a Vite dev server with a proxy would test a topology nobody ships.
 *
 * The environment is provisioned on demand, so a clean checkout only needs
 * `npm run test:e2e`. A provisioned environment short-circuits on a stamp, so
 * the cost is paid once.
 */

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

import {
  CORE_REPO,
  PORT,
  REPO_ROOT,
  SOURCE,
  VENV_DIR,
  distIsBuilt,
  resetState,
  serverEnv,
  venvPython,
} from "../tests/e2e/support/env.mjs";

function fail(message) {
  console.error(`\ne2e server: ${message}\n`);
  process.exit(1);
}

if (!distIsBuilt()) {
  fail("dist/ is missing or incomplete -- run `npm run build` first.");
}

const provision = [
  path.join(REPO_ROOT, "scripts", "provision_e2e_backend.py"),
  "--source",
  SOURCE,
  "--venv",
  VENV_DIR,
];
if (SOURCE === "local") provision.push("--repo", CORE_REPO);

console.log(`e2e server: provisioning backend (source=${SOURCE})`);
const provisioned = spawnSync("python3", provision, { stdio: "inherit" });
if (provisioned.status !== 0) {
  fail("could not provision the backend environment (see the output above).");
}

resetState();

// `desktop/backend_entry.py` is the same entry point the packaged desktop
// application freezes, so the browser suite and the Electron suite start the
// server through identical code.
const child = spawn(
  venvPython(),
  [
    path.join(REPO_ROOT, "desktop", "backend_entry.py"),
    "--host",
    "127.0.0.1",
    "--port",
    String(PORT),
  ],
  {
    cwd: SOURCE === "local" ? CORE_REPO : REPO_ROOT,
    env: { ...process.env, ...serverEnv() },
    stdio: "inherit",
  },
);

const stop = (signal) => () => {
  child.kill(signal);
};
process.on("SIGINT", stop("SIGINT"));
process.on("SIGTERM", stop("SIGTERM"));
child.on("exit", (code) => process.exit(code ?? 0));
