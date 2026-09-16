/**
 * The shell half of the dashboard page object: loading the application,
 * connecting, moving between tabs, and reading canvases. `DashboardPage`
 * extends this with the per-panel accessors.
 *
 * Splitting here keeps both files inside the repository's 250-line limit and
 * separates "drive the application" from "find things inside a panel".
 */

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { Shell } from "./dashboard";

/** The six tabs of the shell, mirroring `src/tabs.ts`. */
export const TAB_IDS = [
  "model",
  "viewer",
  "training",
  "hub",
  "deploy",
  "pipeline",
] as const;

export type TabId = (typeof TAB_IDS)[number];

/** Storage keys the application persists, from `src/storage.ts` and i18n. */
const APP_STORAGE_KEYS = [
  "snn.encodeConfig",
  "snn.trainConfig",
  "snn.theme",
  "snn.autoPredict",
  "snn.tab",
  "spikeforge.locale",
];

/** Guard that makes the seeding script clear storage once per test. */
const SEEDED_FLAG = "__spikeforge_e2e_seeded";

/** Pages that already carry the seeding script, so it is added only once. */
const installed = new WeakSet<Page>();

export class DashboardShell {
  constructor(
    readonly page: Page,
    private readonly shell: Shell,
  ) {}

  /**
   * Install the script that puts each test's first load in a known state.
   *
   * Chromium gets a fresh context per test, but the Electron window is shared
   * across a worker's tests, so persisted state has to be cleared explicitly.
   * The clear is guarded by a session flag: it runs on the load that begins a
   * test and not on any reload a test performs afterwards, which is what lets
   * a spec assert that the open tab survived a reload.
   */
  private async install(): Promise<void> {
    if (installed.has(this.page)) return;
    installed.add(this.page);
    await this.page.addInitScript(
      ([keys, flag]: [string[], string]) => {
        if (!sessionStorage.getItem(flag)) {
          for (const key of keys) localStorage.removeItem(key);
          sessionStorage.setItem(flag, "1");
          // The interface is translated and falls back to the browser's
          // language, so an unpinned locale makes the suite's text
          // assertions depend on the machine it runs on.
          localStorage.setItem("spikeforge.locale", "en");
        }
      },
      [APP_STORAGE_KEYS, SEEDED_FLAG] as [string[], string],
    );
  }

  /** Load the dashboard in a known state and wait for it to connect. */
  async open(): Promise<void> {
    await this.install();
    if (this.shell === "electron") {
      // The window is already pointed at the backend Electron spawned on an
      // ephemeral port, so clear the guard and reload rather than navigate.
      await this.page.evaluate(
        (flag) => sessionStorage.removeItem(flag),
        SEEDED_FLAG,
      );
      await this.page.reload();
    } else {
      await this.page.goto("/");
    }
    await this.waitForConnected();
  }

  /** Wait for the WebSocket to report a live connection in the status bar. */
  async waitForConnected(timeout = 60_000): Promise<void> {
    await expect(this.connection).toHaveClass(/\bok\b/, { timeout });
  }

  /**
   * Wait for the server's bootstrap replies to reach the interface.
   *
   * `useServerBootstrap` asks for the model list, the surrogates, the targets,
   * and a sample on connect. The dataset dropdown only fills in from the model
   * list reply, so a populated dropdown means the round trip completed rather
   * than merely that the socket opened.
   */
  async waitForBootstrap(timeout = 120_000): Promise<void> {
    await this.tab("model");
    const datasets = this.panel("model")
      .locator('[data-tour="dataset"] select');
    await expect
      .poll(async () => (await datasets.locator("option").count()), { timeout })
      .toBeGreaterThan(1);
  }

  // --- shell ------------------------------------------------------------

  get connection(): Locator {
    return this.page.getByTestId("connection");
  }

  get tablist(): Locator {
    return this.page.getByRole("tablist", { name: /sections/i });
  }

  tabButton(id: TabId): Locator {
    return this.page.locator(`#tab-${id}`);
  }

  /** A tab's panel. Inactive panels stay mounted, so scope queries to this. */
  panel(id: TabId): Locator {
    return this.page.locator(`#tabpanel-${id}`);
  }

  /** Switch to a tab and wait for its panel to become visible. */
  async tab(id: TabId): Promise<Locator> {
    await this.tabButton(id).click();
    const panel = this.panel(id);
    await expect(panel).toBeVisible();
    return panel;
  }

  /** The shell's error banner, shown only when the server reports one. */
  get errorBanner(): Locator {
    return this.page.locator(".app-main > .error");
  }

  /**
   * Count the distinct shades in a canvas.
   *
   * Samples, spike rasters, and metric charts are all drawn to canvases, so
   * "the element is visible" says nothing about whether the server's data
   * arrived. A canvas that was never drawn to, or was only cleared to the
   * background colour, yields one shade; anything plotted yields more.
   */
  async canvasShades(canvas: Locator): Promise<number> {
    return canvas.evaluate((node) => {
      const element = node as HTMLCanvasElement;
      const context = element.getContext("2d");
      if (!context || element.width === 0 || element.height === 0) return 0;
      const { data } = context.getImageData(
        0,
        0,
        element.width,
        element.height,
      );
      const shades = new Set<number>();
      for (let index = 0; index < data.length; index += 4) {
        const red = data[index] ?? 0;
        const green = data[index + 1] ?? 0;
        const blue = data[index + 2] ?? 0;
        shades.add((red << 16) | (green << 8) | blue);
      }
      return shades.size;
    });
  }

  /** Wait until a canvas has actually been drawn to. */
  async expectCanvasDrawn(canvas: Locator, timeout = 60_000): Promise<void> {
    await expect
      .poll(() => this.canvasShades(canvas), { timeout })
      .toBeGreaterThan(1);
  }

  /**
   * A cheap hash of a canvas's pixels, for asserting that what is drawn
   * changed. Two different MNIST digits will not collide in practice; two
   * redraws of the same sample will always match.
   */
  async canvasSignature(canvas: Locator): Promise<number> {
    return canvas.evaluate((node) => {
      const element = node as HTMLCanvasElement;
      const context = element.getContext("2d");
      if (!context || element.width === 0) return 0;
      const { data } = context.getImageData(
        0,
        0,
        element.width,
        element.height,
      );
      let hash = 2166136261;
      for (let index = 0; index < data.length; index += 4) {
        hash = Math.imul(hash ^ (data[index] ?? 0), 16777619);
      }
      return hash >>> 0;
    });
  }

  /** A panel addressed by the guided-tour hook it already carries. */
  tourTarget(name: string): Locator {
    return this.page.locator(`[data-tour="${name}"]`);
  }
}
