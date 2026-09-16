/**
 * Scoring a sample end to end: encode, run the network, read the prediction.
 *
 * This is the shortest path through the whole system -- dataset loader,
 * encoder, checkpoint, network, readout, and every protocol frame between --
 * so a failure here is the one worth looking at first.
 */

import { expect, test } from "../../fixtures/dashboard";
import { BASELINE } from "../../support/constants";

test.describe("inference", () => {
  test.beforeEach(async ({ dashboard }) => {
    await dashboard.waitForBootstrap();
    await dashboard.tab("model");
    await dashboard.loadModel(BASELINE);
    await expect(dashboard.currentModel).toHaveText(BASELINE, {
      timeout: 120_000,
    });
  });

  test("predicts a class for the displayed sample", async ({ dashboard }) => {
    await dashboard.tab("viewer");
    await expect(dashboard.predictionPanel).toContainText(
      /auto-predict is off/i,
    );

    await dashboard.setAutoPredict(true);

    await expect(dashboard.predictionValue).toBeVisible({ timeout: 120_000 });
    await expect(dashboard.predictionValue).toHaveText(/^\d$/);
    // MNIST has ten classes; anything outside that is a readout bug rather
    // than an unlucky prediction.
    const predicted = Number(await dashboard.predictionValue.innerText());
    expect(predicted).toBeGreaterThanOrEqual(0);
    expect(predicted).toBeLessThanOrEqual(9);

    await expect(
      dashboard.page.getByTestId("prediction-readout"),
    ).toContainText(/confidence: \d+\.\d%/i);
  });

  test("reports no checkpoint mismatch for its own encoding", async ({
    dashboard,
  }) => {
    await dashboard.tab("viewer");
    await dashboard.setAutoPredict(true);
    await expect(dashboard.predictionValue).toBeVisible({ timeout: 120_000 });
    // The banner is how the interface warns that the encoding no longer
    // matches the weights. Loading a checkpoint restores its own encoding, so
    // it must stay absent here.
    await expect(dashboard.panel("viewer").locator(".mismatch")).toHaveCount(0);
  });

  test("stepping to another sample re-encodes and rescores it", async ({
    dashboard,
  }) => {
    const viewer = await dashboard.tab("viewer");
    await dashboard.setAutoPredict(true);
    await expect(dashboard.predictionValue).toBeVisible({ timeout: 120_000 });

    const input = viewer.locator("canvas").first();
    const before = await dashboard.canvasSignature(input);

    await viewer.getByRole("button", { name: "Next sample" }).click();

    // The drawn input changing proves the server encoded a different sample
    // rather than the interface redrawing a cached one. Comparing the
    // prediction text would not: two digits can score the same class.
    await expect
      .poll(() => dashboard.canvasSignature(input), { timeout: 120_000 })
      .not.toBe(before);
    await expect(viewer.getByLabel("Sample index")).toHaveValue("1");
    await expect(dashboard.predictionValue).toHaveText(/^\d$/);
  });

  test("turning auto-predict off clears the readout", async ({ dashboard }) => {
    await dashboard.tab("viewer");
    await dashboard.setAutoPredict(true);
    await expect(dashboard.predictionValue).toBeVisible({ timeout: 120_000 });

    await dashboard.setAutoPredict(false);
    await expect(dashboard.predictionValue).toHaveCount(0);
    await expect(dashboard.predictionPanel).toContainText(
      /auto-predict is off/i,
    );
  });
});
