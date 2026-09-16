/**
 * Train a model through the interface and save it as the suite's baseline.
 *
 * This is both a test and a fixture. It is the full tier's training coverage --
 * every assertion below is about the real training path working -- and the
 * checkpoint it leaves behind, `e2e-baseline`, is what the inference, pipeline,
 * and deployment specs load instead of each paying for their own run.
 *
 * It runs as its own project so Playwright orders it before the specs that
 * depend on it, rather than relying on file names sorting the right way.
 */

import { expect, test } from "../../fixtures/dashboard";
import { BASELINE } from "../../support/constants";

test("trains a model and saves it as the baseline checkpoint", async ({
  dashboard,
}) => {
  await dashboard.waitForBootstrap();
  await dashboard.useFastTrainingConfig();

  await expect(dashboard.trainStart).toBeEnabled();
  await expect(dashboard.trainStop).toBeDisabled();

  await dashboard.trainStart.click();

  // The server answers `train` with a `train_state` frame; the stop button is
  // the interface's only binding to that flag, so it going live is the proof
  // the run was actually accepted rather than silently dropped.
  await expect(dashboard.trainStop).toBeEnabled({ timeout: 120_000 });

  // The tab strip marks background work, so a user on another tab can see a
  // run is in flight. This is the only assertion that covers that dot.
  await expect(
    dashboard.tabButton("training").locator(".shell-tab-dot"),
  ).toBeVisible();

  // Metrics stream per step. The live row only renders once the first
  // `train_metrics` frame lands, so its contents prove real numbers arrived.
  await dashboard.tab("training");
  await expect(dashboard.trainingLive).toBeVisible({ timeout: 300_000 });
  await expect(dashboard.trainingLive).toContainText(/step \d+ \/ \d+/);
  await expect(dashboard.trainingLive).toContainText(/loss \d+\.\d+/);
  await expect(dashboard.trainingLive).toContainText(/device (cpu|cuda)/);

  // Run to completion: `train_state` flips back and the stop button dies.
  await expect(dashboard.trainStop).toBeDisabled({ timeout: 600_000 });
  await expect(dashboard.trainStart).toBeEnabled();

  // A finished run leaves a loss curve behind, not just a final number. The
  // charts are drawn to canvases, so the pixels are the only evidence.
  await dashboard.expectCanvasDrawn(
    dashboard.panel("training").locator("canvas").first(),
  );

  await dashboard.tab("model");
  await dashboard.saveModel(BASELINE);

  // The save is only real once the server says so: it replies with a fresh
  // model list, which is what repopulates this dropdown.
  await expect
    .poll(() => dashboard.savedModels(), { timeout: 60_000 })
    .toContain(BASELINE);
  await expect(dashboard.errorBanner).toHaveCount(0);
});
