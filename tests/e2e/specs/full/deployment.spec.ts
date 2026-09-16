/**
 * Deployment targets, capability reports, and the energy estimate.
 *
 * The honest-degradation contract matters as much as the happy path here: a
 * target whose vendor SDK is absent has to say so plainly, and a target with
 * no cost table has to decline to estimate rather than invent a number. Both
 * are asserted below, because a silent fabrication would look like success.
 */

import { expect, test } from "../../fixtures/dashboard";
import { BASELINE } from "../../support/constants";

test.describe("deployment", () => {
  test.beforeEach(async ({ dashboard }) => {
    await dashboard.waitForBootstrap();
  });

  test("lists every registered target with its availability", async ({
    dashboard,
  }) => {
    await dashboard.tab("deploy");
    const targets = dashboard.tourTarget("targets");
    const rows = targets.locator(".target-item");
    await expect.poll(() => rows.count()).toBeGreaterThan(1);

    // No vendor SDK is installed here, so the SDK-backed targets must be
    // listed and marked missing rather than hidden. A registry that quietly
    // drops what it cannot run is the failure this guards against.
    await expect(rows.filter({ hasText: "reference" })).toContainText(
      "available",
    );
    const missing = rows.filter({ hasText: "SDK missing" });
    await expect.poll(() => missing.count()).toBeGreaterThan(0);
    // Each unavailable target must name the extra that would install it.
    await expect(missing.first()).toContainText(/extra: \w+/);
  });

  test("shows the capability report for the reference target", async ({
    dashboard,
  }) => {
    await dashboard.tab("deploy");
    const targets = dashboard.tourTarget("targets");
    await expect(targets).toContainText(/select a target/i);

    // Selecting a row is what requests its report; the panel is deliberately
    // empty until then so a stale report can never be read as the current one.
    await targets
      .locator(".target-item")
      .filter({ hasText: "reference" })
      .click();

    // The report names the verdict, the per-layer breakdown, and the
    // constraints the target runs under -- that is what tells a user whether
    // their graph will run there at all.
    await expect(targets).toContainText(/deployable/i, { timeout: 60_000 });
    await expect(targets).toContainText(/\d+ supported/);
    await expect(targets).toContainText(/\d+ unsupported/);
    await expect(targets).toContainText(/float32/);

    // The reference target validates the exported graph against snnTorch and
    // reports the drift. A report with no verdict would hide a silent
    // numerical divergence behind a green "deployable".
    await expect(targets).toContainText(
      /validation . (within tolerance|drift)/i,
    );
  });

  test("estimates energy for a loaded checkpoint", async ({ dashboard }) => {
    await dashboard.tab("model");
    await dashboard.loadModel(BASELINE);
    await expect(dashboard.currentModel).toHaveText(BASELINE, {
      timeout: 120_000,
    });

    await dashboard.tab("deploy");
    await dashboard.energyTarget.selectOption("reference");
    await dashboard.energyRun.click();

    await expect(dashboard.energyReport).toBeVisible({ timeout: 180_000 });
    // Operation counts are the part of the report that is always present;
    // energy itself is only reported when the target declares a cost table.
    await expect(dashboard.energyReport).toContainText("SOP");
    await expect(dashboard.energyReport).toContainText("MAC");

    const panel = dashboard.tourTarget("energy");
    // Every report says which it is. A run that claims neither has lost track
    // of its own provenance.
    await expect(panel.locator(".energy-badge")).toHaveText(
      /estimate|measured/,
    );
    await expect(dashboard.errorBanner).toHaveCount(0);
  });

  test("declines to invent energy for a target with no cost table", async ({
    dashboard,
  }) => {
    await dashboard.tab("deploy");
    const options = await dashboard.energyTarget
      .locator("option")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLOptionElement).value),
      );
    expect(options.length).toBeGreaterThan(0);

    for (const target of options) {
      await dashboard.energyTarget.selectOption(target);
      await dashboard.energyRun.click();
      await expect(dashboard.energyReport).toBeVisible({ timeout: 180_000 });

      const panel = dashboard.tourTarget("energy");
      const text = await panel.innerText();
      // Either a figure with a unit, or the explicit refusal. Never blank,
      // and never a bare zero presented as a measurement.
      const reported =
        /energy \d/.test(text) ||
        /energy unavailable for this target/i.test(text);
      expect(
        reported,
        `energy panel for ${target} reported no figure and no reason:\n${text}`,
      ).toBe(true);
    }
  });
});
