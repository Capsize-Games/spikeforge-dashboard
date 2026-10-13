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

  /**
   * Model & Data is the docked workspace: an asset browser, the data and
   * encoding editor, and the network inspector, side by side and each as tall
   * as the workspace. A regression that flattened it back into cards stacked
   * in columns would leave every selector above passing, so the composition
   * itself is asserted here.
   */
  test("model tab docks three full-height panes", async ({ dashboard }) => {
    const panel = await dashboard.tab("model");
    const assets = panel.locator(".dock-pane--assets");
    const editor = panel.locator(".dock-pane--editor");
    const inspector = panel.locator(".dock-pane--inspector");

    for (const pane of [assets, editor, inspector]) {
      await expect(pane).toBeVisible();
    }

    const boxes = await Promise.all(
      [assets, editor, inspector].map((pane) => pane.boundingBox()),
    );
    const [left, middle, right] = boxes;
    if (left === null || middle === null || right === null) {
      throw new Error("a docked pane has no layout box");
    }

    // Left to right, in that order, and touching: adjacent panes share an
    // edge rather than sitting in a gutter.
    expect(Math.round(left.x + left.width)).toBe(Math.round(middle.x));
    expect(Math.round(middle.x + middle.width)).toBe(Math.round(right.x));

    // Each pane fills the workspace: the shell leaves no gap below a short
    // form, and none of the three is shorter than another.
    const heights = new Set(boxes.map((box) => Math.round(box?.height ?? 0)));
    expect(heights.size).toBe(1);
    const workspace = await panel.boundingBox();
    expect(Math.round(left.height)).toBe(Math.round(workspace?.height ?? 0));
  });

  /**
   * On a narrower desktop the asset browser gives way first: between the two
   * collapse widths it is a 42px strip while the inspector still has its full
   * width, and the editor never collapses at all. The collapse is reversible
   * by hand and hides the body rather than unmounting it, so the checkpoint
   * list survives.
   */
  test("asset browser collapses first and expands again", async ({
    dashboard,
  }) => {
    // Below the asset browser's collapse width, above the inspector's.
    await dashboard.page.setViewportSize({ width: 1100, height: 800 });
    // The starting state is read from the viewport at first paint.
    await dashboard.page.reload();
    const panel = await dashboard.tab("model");

    const assets = panel.locator(".dock-pane--assets");
    const toggle = assets.locator(".pane-toggle");
    await expect(assets).toHaveClass(/collapsed/);
    await expect(assets.locator(".pane-body")).toBeHidden();
    await expect(panel.locator(".dock-pane--inspector")).not.toHaveClass(
      /collapsed/,
    );

    await toggle.click();
    await expect(assets).not.toHaveClass(/collapsed/);
    await expect(assets.locator(".pane-body")).toBeVisible();
    await expect(dashboard.modelPanel).toBeVisible();
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
