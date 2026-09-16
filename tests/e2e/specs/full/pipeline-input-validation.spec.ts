/** Valid JSON can still be an invalid pipeline request, including `null`. */
import { expect, test } from "../../fixtures/dashboard";
import { BASELINE } from "../../support/constants";

const INVALID_PAYLOADS = [
  null,
  false,
  42,
  "not an object",
  [],
  { frames: null },
];

test.describe("pipeline input validation", () => {
  test.beforeEach(async ({ dashboard }) => {
    await dashboard.waitForBootstrap();
    await dashboard.tab("pipeline");
    await expect(dashboard.pipelinePanel).toBeVisible({ timeout: 60_000 });
    await dashboard.page.getByTestId("pipeline-checkpoint")
      .selectOption(BASELINE);
    await dashboard.page.getByTestId("pipeline-add-node").click();
  });

  for (const payload of INVALID_PAYLOADS) {
    const text = JSON.stringify(payload);
    test(`rejects ${text} without throwing`, async ({ dashboard }) => {
      const errors: Error[] = [];
      dashboard.page.on("pageerror", (error) => errors.push(error));
      await dashboard.page.getByTestId("pipeline-input").fill(text);
      await dashboard.page.getByTestId("pipeline-run").click();

      await expect(dashboard.pipelinePanel.locator(".mismatch"))
        .toContainText(/frames/i);
      await expect(dashboard.page.getByTestId("pipeline-run"))
        .toBeEnabled();
      expect(errors).toEqual([]);
    });
  }
});
