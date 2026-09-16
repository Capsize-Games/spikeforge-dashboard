/**
 * The checkpoint lifecycle: load a saved model, unload it, export a bundle.
 *
 * The baseline checkpoint these load was trained through the interface by
 * `checkpoint.setup.ts`, so this covers the round trip a user actually makes
 * -- train, save, come back, load -- rather than a fixture written to disk.
 */

import { expect, test } from "../../fixtures/dashboard";
import { BASELINE } from "../../support/constants";

test.describe("checkpoints", () => {
  test.beforeEach(async ({ dashboard }) => {
    await dashboard.waitForBootstrap();
  });

  test("lists the saved checkpoint the suite trained", async ({
    dashboard,
  }) => {
    await dashboard.tab("model");
    expect(await dashboard.savedModels()).toContain(BASELINE);
  });

  test("loads a checkpoint and names it as the current model", async ({
    dashboard,
  }) => {
    await dashboard.tab("model");
    await expect(dashboard.currentModel).toHaveText(/none/i);

    await dashboard.loadModel(BASELINE);

    await expect(dashboard.currentModel).toHaveText(BASELINE, {
      timeout: 120_000,
    });
    await expect(dashboard.errorBanner).toHaveCount(0);
  });

  test("restores the encoding the checkpoint was trained with", async ({
    dashboard,
  }) => {
    await dashboard.tab("model");
    // The baseline was trained at 10 time steps while the interface defaults
    // to 100. A load that does not restore the checkpoint's own encoding
    // would fail the server's compatibility check on the next inference.
    await expect(dashboard.field("num_steps").locator("b")).toHaveText("100");

    await dashboard.loadModel(BASELINE);
    await expect(dashboard.currentModel).toHaveText(BASELINE, {
      timeout: 120_000,
    });
    await expect(dashboard.field("num_steps").locator("b")).toHaveText("10");

    // A loaded checkpoint locks the architecture and encoding controls, so
    // they cannot drift out of step with the weights.
    await expect(
      dashboard.panel("model").locator(".lock-note"),
    ).toBeVisible();
  });

  test("unloads a checkpoint after confirmation", async ({ dashboard }) => {
    await dashboard.tab("model");
    await dashboard.loadModel(BASELINE);
    await expect(dashboard.currentModel).toHaveText(BASELINE, {
      timeout: 120_000,
    });

    await dashboard.modelPanel.locator(".model-chip-x").click();
    const dialog = dashboard.page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: /unload|discard|delete/i })
      .click();

    await expect(dashboard.currentModel).toHaveText(/none/i);
  });

  test("offers the checkpoint as a downloadable deployment bundle", async ({
    dashboard,
  }) => {
    await dashboard.tab("model");
    await dashboard.page.getByTestId("model-tab-bundle").click();
    await dashboard.modelPanel
      .locator('select[aria-label="Model to bundle"]')
      .selectOption(BASELINE);

    const link = dashboard.modelPanel.locator("a[download]");
    await expect(link).toHaveAttribute(
      "href",
      new RegExp(`/api/bundle/${BASELINE}`),
    );

    // Follow the link the way the browser would: a bundle route that 404s
    // would leave the interface looking correct and the button dead.
    const href = await link.getAttribute("href");
    expect(href).not.toBeNull();
    const response = await dashboard.page.request.get(href ?? "");
    expect(response.status()).toBe(200);
    expect(Number(response.headers()["content-length"] ?? "1")).toBeGreaterThan(
      0,
    );
  });
});
