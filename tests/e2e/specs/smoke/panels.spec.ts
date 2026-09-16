/**
 * Each tab renders the panels it promises, populated from real server data.
 *
 * This is the breadth half of the smoke tier: it does not drive a workflow,
 * it proves that nothing on any tab is blank, missing, or stuck on an empty
 * state after the server has answered. A panel that renders here but does
 * nothing is caught by the full tier instead.
 */

import { expect, test } from "../../fixtures/dashboard";

test.describe("panels", () => {
  test("model tab shows the checkpoint manager and the controls", async ({
    dashboard,
  }) => {
    const panel = await dashboard.tab("model");
    await expect(dashboard.modelPanel).toBeVisible();
    await expect(dashboard.currentModel).toBeVisible();
    await expect(dashboard.trainStart).toBeVisible();
    await expect(panel.locator(".controls")).toBeVisible();
    await expect(dashboard.tourTarget("coding")).toBeVisible();
    await expect(dashboard.tourTarget("topology")).toBeVisible();
    await expect(dashboard.tourTarget("neuron")).toBeVisible();
  });

  test("viewer tab shows the input, prediction, and trajectory panels", async ({
    dashboard,
  }) => {
    await dashboard.tab("viewer");
    await expect(dashboard.tourTarget("input-raster").first()).toBeVisible();
    await expect(dashboard.predictionPanel).toBeVisible();
    await expect(dashboard.tourTarget("trajectory")).toBeVisible();
    // With no checkpoint loaded the prediction panel must say so rather than
    // render an empty card.
    await expect(dashboard.predictionPanel).toContainText(
      /auto-predict is off|train or load a model/i,
    );
  });

  test("training tab shows live metrics and the analysis panels", async ({
    dashboard,
  }) => {
    const panel = await dashboard.tab("training");
    await expect(panel).toContainText(/training/i);
    await expect(dashboard.tourTarget("encoding-report")).toBeVisible();
    await expect(dashboard.tourTarget("surrogate-curve")).toBeVisible();
    await expect(dashboard.tourTarget("benchmark")).toBeVisible();
  });

  test("hub tab lists the offline catalog", async ({ dashboard }) => {
    await dashboard.tab("hub");
    await expect(dashboard.tourTarget("hub")).toBeVisible();
    // The catalog ships with the hub distribution and resolves without
    // network access, so an empty list here is a real failure.
    await expect(dashboard.hubList).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => dashboard.hubList.locator("li").count())
      .toBeGreaterThan(0);
  });

  test("deploy tab shows targets and the energy estimator", async ({
    dashboard,
  }) => {
    await dashboard.tab("deploy");
    await expect(dashboard.tourTarget("targets")).toBeVisible();
    await expect(dashboard.tourTarget("energy")).toBeVisible();
    await expect(dashboard.energyTarget).toBeVisible();
    await expect
      .poll(() => dashboard.energyTarget.locator("option").count())
      .toBeGreaterThan(0);
  });

  test("pipeline tab loads its lazy bundle and renders the canvas", async ({
    dashboard,
  }) => {
    await dashboard.tab("pipeline");
    // The pipeline panel is the app's only code-split boundary, so this also
    // covers the lazy chunk being served and resolving.
    await expect(dashboard.pipelinePanel).toBeVisible({ timeout: 30_000 });
    await expect(
      dashboard.pipelinePanel.locator(".pipeline-canvas"),
    ).toBeVisible();
    await expect(dashboard.page.getByTestId("pipeline-run")).toBeVisible();
  });
});
