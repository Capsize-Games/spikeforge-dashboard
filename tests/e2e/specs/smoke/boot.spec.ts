/**
 * The dashboard boots, reaches its server, and reports nothing broken.
 *
 * Everything else in the suite assumes this passes, so it is deliberately the
 * first file: when the shell cannot connect, a hundred panel assertions
 * failing tells you nothing the connection assertion did not already say.
 */

import { expect, test } from "../../fixtures/dashboard";

test.describe("boot", () => {
  test("connects to the server and says so in the status bar", async ({
    dashboard,
  }) => {
    await expect(dashboard.connection).toHaveClass(/\bok\b/);
    await expect(dashboard.connection).toContainText(/connected/i);
  });

  test("renders the shell chrome", async ({ dashboard }) => {
    await expect(dashboard.tablist).toBeVisible();
    await expect(dashboard.page.locator(".app-header")).toBeVisible();
    await expect(dashboard.page.locator(".app-footer")).toBeVisible();
  });

  test("shows no error banner on a clean start", async ({ dashboard }) => {
    await dashboard.waitForBootstrap();
    await expect(dashboard.errorBanner).toHaveCount(0);
  });

  test("logs no console errors while starting up", async ({
    dashboard,
    consoleErrors,
  }) => {
    await dashboard.waitForBootstrap();
    expect(consoleErrors).toEqual([]);
  });

  test("survives a reload and reconnects", async ({ dashboard }) => {
    await dashboard.waitForBootstrap();
    await dashboard.page.reload();
    await dashboard.waitForConnected();
    await dashboard.waitForBootstrap();
  });

  test("reconnects on its own when the socket drops", async ({
    page,
    shell,
  }) => {
    // `useWebSocket` retries every 1.5s on any close that is not the auth
    // rejection. Proving that needs a socket that dies without the server
    // going away, so the page's WebSocket constructor is wrapped before the
    // application loads and the live socket is closed from the test.
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      const opened: WebSocket[] = [];
      (window as unknown as { __sockets: WebSocket[] }).__sockets = opened;
      class Recording extends Native {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          opened.push(this);
        }
      }
      window.WebSocket = Recording as unknown as typeof WebSocket;
    });
    if (shell === "electron") await page.reload();
    else await page.goto("/");

    const connection = page.getByTestId("connection");
    await expect(connection).toHaveClass(/\bok\b/, { timeout: 60_000 });

    const openedBefore = await page.evaluate(
      () => (window as unknown as { __sockets: WebSocket[] }).__sockets.length,
    );
    await page.evaluate(() => {
      const sockets = (window as unknown as { __sockets: WebSocket[] })
        .__sockets;
      // 4000 is an application-range code, so the client treats it as an
      // ordinary drop and retries, rather than as the 1008 auth refusal.
      sockets[sockets.length - 1]?.close(4000, "e2e induced drop");
    });

    await expect(connection).toHaveClass(/\bbad\b/);
    await expect(connection).toHaveClass(/\bok\b/, { timeout: 30_000 });
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __sockets: WebSocket[] }).__sockets.length,
      ),
    ).toBeGreaterThan(openedBefore);
  });
});
