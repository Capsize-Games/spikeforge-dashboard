/**
 * End-to-end configuration for the dashboard.
 *
 * The suite runs the built `dist/` served by a real SpikeForge server on one
 * origin, which is the topology Docker and the desktop application both use.
 * See `tests/e2e/README.md` for how to run it and what each project covers.
 */

import { defineConfig, devices } from "@playwright/test";

import { BASE_URL, PORT } from "./tests/e2e/support/env.mjs";

import type {
  DashboardWorkerOptions,
  Shell,
} from "./tests/e2e/fixtures/dashboard";

/** Longer than a browser default: the first run downloads MNIST. */
const ACTION_TIMEOUT = 30_000;

/**
 * Ceiling for a spec that trains or runs a network on the CPU. Generous on
 * purpose: a busy machine can take several times as long as an idle one, and
 * a timeout here reports a product failure that did not happen.
 */
const TRAINING_TIMEOUT = 20 * 60_000;

const browser = { ...devices["Desktop Chrome"], shell: "browser" as Shell };

export default defineConfig<object, DashboardWorkerOptions>({
  testDir: "./tests/e2e/specs",
  // Enough for the smoke tier, whose slowest wait is the first MNIST
  // download. The tiers that train raise this per project.
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  // A failing assertion should say what broke, not stop the rest of the run.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One server, one dataset cache, one set of saved checkpoints: the specs
  // share real backend state, so they run in a single worker.
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    actionTimeout: ACTION_TIMEOUT,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      // The tier that gates every change: boots, connects, every panel
      // renders against real server payloads. Minutes, not tens of minutes.
      name: "smoke",
      testDir: "./tests/e2e/specs/smoke",
      use: browser,
    },
    {
      // Trains the checkpoint the rest of the full tier loads. Split out so
      // Playwright orders it first, rather than relying on file names sorting
      // the right way, and so one CPU training run serves every spec.
      name: "full-setup",
      testDir: "./tests/e2e/specs/full",
      testMatch: /.*\.setup\.ts/,
      use: browser,
      // A CPU training run takes minutes, and how many depends on what else
      // the machine is doing. This has to exceed the longest `expect` inside
      // the spec, or the test times out before the assertion can.
      timeout: TRAINING_TIMEOUT,
    },
    {
      // The tier that answers "does the product work": real training, real
      // checkpoints, real inference, real pipeline runs.
      name: "full",
      testDir: "./tests/e2e/specs/full",
      testMatch: /.*\.spec\.ts/,
      use: browser,
      dependencies: ["smoke", "full-setup"],
      // Loading a checkpoint and running a pipeline are both real CPU work.
      timeout: TRAINING_TIMEOUT,
    },
    {
      // The packaged shell. Runs the smoke specs against the Electron window
      // plus the specs that only make sense for the desktop application.
      name: "electron",
      testDir: "./tests/e2e/specs",
      testMatch: ["smoke/**/*.spec.ts", "electron/**/*.spec.ts"],
      use: { shell: "electron" as Shell },
    },
  ],

  webServer: {
    command: "node scripts/run_e2e_server.mjs",
    url: `${BASE_URL}/health`,
    // A cold run provisions a virtual environment and downloads Torch.
    timeout: 15 * 60_000,
    reuseExistingServer: !process.env.CI,
    // Uvicorn's access log on stdout would bury the test output; its error
    // log goes to stderr, which stays piped so a crash is still visible.
    stdout: "ignore",
    stderr: "pipe",
    env: { SPIKEFORGE_E2E_PORT: String(PORT) },
  },
});
