/**
 * The four requests the client makes on connect all come back and land.
 *
 * `useServerBootstrap` asks for the model list, the surrogates, the targets,
 * and a configured sample the moment the socket opens, then polls stats. Each
 * assertion below reads a piece of interface that can only be populated by one
 * of those replies, so this file covers the whole handshake rather than
 * re-testing that a socket can open.
 */

import { expect, test } from "../../fixtures/dashboard";

test.describe("bootstrap", () => {
  test("fills the dataset picker from the model-list reply", async ({
    dashboard,
  }) => {
    await dashboard.tab("model");
    const options = dashboard.datasetSelect.locator("option");
    await expect.poll(() => options.count()).toBeGreaterThan(1);
    // The catalog the server ships; a missing MNIST means a broken registry,
    // not a slow reply.
    await expect(options.filter({ hasText: /^mnist/ })).toHaveCount(1);
  });

  test("fills the surrogate picker from the surrogates reply", async ({
    dashboard,
  }) => {
    await dashboard.tab("model");
    const surrogate = dashboard
      .panel("model")
      .locator('[data-tour="surrogate"] select');
    await expect
      .poll(() => surrogate.locator("option").count())
      .toBeGreaterThan(1);
    await expect(
      surrogate.locator("option").filter({ hasText: "fast_sigmoid" }),
    ).toHaveCount(1);
  });

  test("lists deployment targets and the reference report", async ({
    dashboard,
  }) => {
    await dashboard.tab("deploy");
    const targets = dashboard.tourTarget("targets");
    await expect(targets).toBeVisible();
    // `reference` is the in-process NIR interpreter: always registered, never
    // gated behind a vendor SDK, so it must be present on any install.
    await expect(targets).toContainText("reference");
  });

  test("streams system stats into the resource monitor", async ({
    dashboard,
  }) => {
    // The monitor renders its labels before any reply arrives, so the labels
    // prove nothing. What does: the placeholder clearing, and a real memory
    // reading appearing in its place. Stats are polled every two seconds.
    const monitor = dashboard.page.locator(".res-bar");
    await expect(monitor.getByText(/waiting for stats/i)).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(monitor.locator(".res-item").first()).toContainText(
      /\d+\.\d+\/\d+\.\d+ GB/,
    );
  });

  test("renders a sample from the configure reply", async ({ dashboard }) => {
    await dashboard.tab("viewer");
    const canvases = dashboard.panel("viewer").locator("canvas");
    // The first run downloads MNIST, so this is the slowest wait in the tier.
    await expect
      .poll(() => canvases.count(), { timeout: 180_000 })
      .toBeGreaterThan(0);

    // A canvas element proves the component mounted, not that the server sent
    // a sample. Reading the pixels distinguishes "drew the digit" from "drew
    // nothing".
    await dashboard.expectCanvasDrawn(canvases.first());

    // The data pane's own preview shows the same frame. It waits on nothing
    // new — the sample the viewer just drew is already in state — so this
    // costs no extra time and covers a second pane rendering real data.
    const preview = dashboard
      .panel("model")
      .locator(".sample-preview canvas")
      .first();
    await expect(preview).toHaveCount(1);
    await dashboard.expectCanvasDrawn(preview);
  });
});
