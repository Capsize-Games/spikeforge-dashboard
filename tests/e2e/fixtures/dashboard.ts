/**
 * The fixture every end-to-end spec builds on.
 *
 * A spec asks for `dashboard` and gets a connected application, without
 * knowing whether it is looking at a Chromium tab pointed at the server or at
 * the window the Electron shell opened over its own supervised backend. That
 * is what lets the smoke tier run unchanged in both.
 */

import { expect, test as base } from "@playwright/test";
import type { ElectronApplication } from "@playwright/test";

import { DashboardPage } from "./dashboard-page";
import { launchDesktopApp, onlyInElectron } from "../support/electron";
import type { LaunchRecord } from "../support/electron";

/** Which shell a project runs its specs in. */
export type Shell = "browser" | "electron";

/** Worker-scoped options a project sets in `playwright.config.ts`. */
export interface DashboardWorkerOptions {
  shell: Shell;
}

interface Fixtures {
  /** The dashboard under test, already connected to its server. */
  dashboard: DashboardPage;
  /** Console errors and page crashes seen during the test. */
  consoleErrors: string[];
}

/**
 * `shell` is worker-scoped because the Electron application it selects is
 * launched once per worker, and a worker fixture cannot depend on a
 * test-scoped one.
 */
interface WorkerFixtures extends DashboardWorkerOptions {
  /** The Electron application, launched per worker, or null in a browser. */
  electronApp: ElectronApplication | null;
  /** What Electron passed to the backend it spawned, or null in a browser. */
  launchRecord: LaunchRecord | null;
}

/** Set by the `electronApp` fixture so `launchRecord` can hand it on. */
let launchedRecord: LaunchRecord | null = null;

export const test = base.extend<Fixtures, WorkerFixtures>({
  shell: ["browser", { scope: "worker", option: true }],

  electronApp: [
    async ({ shell }, use, workerInfo) => {
      if (shell !== "electron") {
        await use(null);
        return;
      }
      const launch = await launchDesktopApp(`w${workerInfo.workerIndex}`);
      launchedRecord = launch.readRecord();
      await use(launch.app);
      await launch.app.close();
    },
    { scope: "worker" },
  ],

  launchRecord: [
    async ({ electronApp }, use) => {
      await use(electronApp === null ? null : launchedRecord);
    },
    { scope: "worker" },
  ],

  page: async ({ shell, page, electronApp }, use) => {
    if (shell !== "electron") {
      await use(page);
      return;
    }
    const app = onlyInElectron(electronApp, "electronApp");
    const window = await app.firstWindow();
    await use(window);
  },

  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(`uncaught: ${error.message}`));
    page.on("crash", () => errors.push("the page crashed"));
    await use(errors);
  },

  dashboard: async ({ page, shell }, use) => {
    const dashboard = new DashboardPage(page, shell);
    await dashboard.open();
    await use(dashboard);
  },
});

export { expect };
