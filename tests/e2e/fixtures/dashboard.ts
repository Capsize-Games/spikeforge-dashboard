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
import {
  closeDesktopApp,
  launchDesktopApp,
  onlyInElectron,
} from "../support/electron";
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
  /** The Electron application for this spec file, or null in a browser. */
  electronApp: ElectronApplication | null;
  /** What Electron passed to the backend, or null in a browser. */
  launchRecord: LaunchRecord | null;
}

type WorkerFixtures = DashboardWorkerOptions;

/** The Electron process is shared by tests in one spec file only. */
let fileLaunch: Awaited<ReturnType<typeof launchDesktopApp>> | null = null;

export const test = base.extend<Fixtures, WorkerFixtures>({
  shell: ["browser", { scope: "worker", option: true }],

  electronApp: async ({ shell }, use) => {
    if (shell !== "electron") {
      await use(null);
      return;
    }
    if (fileLaunch === null) {
      throw new Error("Electron app was not launched for this spec file");
    }
    await use(fileLaunch.app);
  },

  launchRecord: async ({ shell }, use) => {
    if (shell !== "electron") {
      await use(null);
      return;
    }
    if (fileLaunch === null) {
      throw new Error("Electron app was not launched for this spec file");
    }
    await use(fileLaunch.readRecord());
  },

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

test.beforeAll(async ({ shell }, workerInfo) => {
  test.setTimeout(180_000);
  if (shell === "electron") {
    fileLaunch = await launchDesktopApp(`w${workerInfo.workerIndex}`);
  }
});

test.afterAll(async ({ shell }) => {
  test.setTimeout(60_000);
  if (shell === "electron" && fileLaunch !== null) {
    const launch = fileLaunch;
    fileLaunch = null;
    await closeDesktopApp(launch);
  }
});

export { expect };
