/**
 * What the desktop shell adds on top of the dashboard.
 *
 * The browser suite already covers the interface, and the smoke tier re-runs
 * all of it inside this window. What is left is everything Electron itself is
 * responsible for: supervising a local engine on an ephemeral port, keeping a
 * user's data in the per-user application directory, refusing to navigate
 * itself away from the local app, and not leaving a Python process behind when
 * the window closes.
 */

import { expect, test } from "../../fixtures/dashboard";
import {
  isRunning,
  launchDesktopApp,
  onlyInElectron,
} from "../../support/electron";

test.describe("desktop shell", () => {
  test("opens a window that has loaded the dashboard", async ({
    electronApp,
    dashboard,
  }) => {
    const app = onlyInElectron(electronApp, "electronApp");
    await expect(dashboard.tablist).toBeVisible();

    // The window title comes from the loaded document once the dashboard has
    // rendered, so this is also the proof the shell did not stop at a blank
    // window or an error page.
    const title = await app.evaluate(async ({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      return window?.getTitle() ?? null;
    });
    expect(title).toMatch(/spikeforge/i);
  });

  test("serves the dashboard from the engine it spawned", async ({
    dashboard,
    launchRecord,
  }) => {
    const port = dashboard.page.url();

    // Electron reserves a free port rather than the fixed 8877, so two copies
    // of the application -- or a running `npm run dev` -- never collide.
    const { args } = onlyInElectron(launchRecord, "launchRecord");
    expect(args).toContain("--host");
    expect(args[args.indexOf("--host") + 1]).toBe("127.0.0.1");

    const backendPort = Number(args[args.indexOf("--port") + 1]);
    expect(backendPort).toBeGreaterThan(1024);
    expect(backendPort).not.toBe(8877);
    expect(port).toContain(`127.0.0.1:${backendPort}`);
  });

  test("keeps the user's data in the per-user application directory", async ({
    electronApp,
    launchRecord,
  }) => {
    const shell = onlyInElectron(electronApp, "electronApp");
    const record = onlyInElectron(launchRecord, "launchRecord");
    const userData = await shell.evaluate(({ app }) => app.getPath("userData"));

    // Datasets, checkpoints, and logs must land under the OS profile, not in
    // the installation directory, or an installed copy could not write them.
    expect(record.dataDir.startsWith(userData)).toBe(true);
    expect(record.dashboardDist).toContain("dist");
    // Unbuffered output is what makes the backend log useful when a user is
    // asked for it after a crash.
    expect(record.unbuffered).toBe("1");
  });

  test("refuses to navigate the window away from the local app", async ({
    dashboard,
    electronApp,
  }) => {
    const before = dashboard.page.url();

    // `will-navigate` is prevented for anything off the local origin, and the
    // window-open handler denies every new window. Without this, a link in
    // rendered content could replace the application with a remote page.
    await dashboard.page.evaluate(() => {
      window.location.href = "https://example.com/";
    });
    await dashboard.page.waitForTimeout(2_000);
    expect(dashboard.page.url()).toBe(before);

    const windows = await onlyInElectron(electronApp, "electronApp").evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    );
    expect(windows).toBe(1);
  });

  test("stops its engine when the application quits", async () => {
    // A fresh application, because this test's whole point is to close one.
    // An orphaned backend would hold its port and keep a CPU busy after the
    // user thinks they have quit.
    const launch = await launchDesktopApp("shutdown");
    const { pid } = launch.readRecord();
    expect(isRunning(pid)).toBe(true);

    await launch.app.close();

    await expect
      .poll(() => isRunning(pid), { timeout: 30_000 })
      .toBe(false);
  });
});
