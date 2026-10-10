import path from "node:path";

import { expect, test } from "@playwright/test";
import { createServer } from "vite";

import { BASE_URL, REPO_ROOT } from "../../support/env.mjs";

test("reconnects after StrictMode replays the connection effect", async ({
  page,
}) => {
  const server = await createServer({
    configFile: path.join(REPO_ROOT, "vite.config.ts"),
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: {
        "/ws": { target: BASE_URL.replace("http", "ws"), ws: true },
        "/health": { target: BASE_URL },
        "/api": { target: BASE_URL },
      },
    },
  });
  await server.listen();
  try {
    const url = server.resolvedUrls?.local[0];
    if (!url) throw new Error("Vite did not expose its development URL");
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      const sockets: WebSocket[] = [];
      (window as unknown as { __sockets: WebSocket[] }).__sockets = sockets;
      class Recording extends Native {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          if (new URL(url, location.href).pathname === "/ws") {
            sockets.push(this);
          }
        }
      }
      window.WebSocket = Recording;
    });
    await page.goto(url);
    const connection = page.getByTestId("connection");
    await expect(connection).toHaveClass(/\bok\b/, { timeout: 60_000 });
    await page.evaluate(() => {
      const sockets = (window as unknown as { __sockets: WebSocket[] })
        .__sockets;
      if (sockets.length < 2) throw new Error("StrictMode did not replay");
      sockets[sockets.length - 1]?.close(4000, "regression induced drop");
    });
    await expect(connection).toHaveClass(/\bbad\b/);
    await expect(connection).toHaveClass(/\bok\b/, { timeout: 10_000 });
  } finally {
    await server.close();
  }
});
