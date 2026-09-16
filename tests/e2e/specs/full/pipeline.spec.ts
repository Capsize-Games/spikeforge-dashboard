/**
 * Chaining checkpoints into a graph and running it as one program.
 *
 * The pipeline tab is the app's only lazily loaded bundle and its only
 * third-party canvas, so it is also the part most likely to break silently in
 * a production build. These drive it as a user would: add a node, save it,
 * reload it, run it, read the result.
 */

import { expect, test } from "../../fixtures/dashboard";
import { BASELINE, CONV_BASELINE } from "../../support/constants";

/** A 2-D image frame, which the fully connected baseline cannot consume. */
const WRONG_SHAPE_INPUT = JSON.stringify({
  frames: [Array.from({ length: 28 }, () => new Array(28).fill(0))],
  encoded: false,
});

test.describe("pipeline", () => {
  test.beforeEach(async ({ dashboard }) => {
    await dashboard.waitForBootstrap();
    await dashboard.tab("pipeline");
    await expect(dashboard.pipelinePanel).toBeVisible({ timeout: 60_000 });
  });

  test("adds a saved checkpoint to the graph", async ({ dashboard }) => {
    await dashboard.page
      .getByTestId("pipeline-checkpoint")
      .selectOption(BASELINE);
    await dashboard.page.getByTestId("pipeline-add-node").click();

    const node = dashboard.pipelinePanel.locator(".react-flow__node");
    await expect(node).toHaveCount(1);
    await expect(node).toContainText(BASELINE);
  });

  test("saves a graph and loads it back", async ({ dashboard }) => {
    const name = `e2e-pipeline-${Date.now()}`;
    await dashboard.page
      .getByTestId("pipeline-checkpoint")
      .selectOption(BASELINE);
    await dashboard.page.getByTestId("pipeline-add-node").click();
    await dashboard.page.getByTestId("pipeline-name").fill(name);
    await dashboard.page.getByTestId("pipeline-save").click();

    // The server confirms the save on the status line; without waiting for
    // it the reload below could race the write.
    await expect(dashboard.pipelineStatus).toHaveText(`saved ${name}`, {
      timeout: 60_000,
    });

    // Clear the canvas, then load the saved graph back from the server: an
    // in-memory graph that never round-tripped would still pass a weaker test.
    await dashboard.page.getByTestId("pipeline-new").click();
    const dialog = dashboard.page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /discard/i }).click();
    await expect(
      dashboard.pipelinePanel.locator(".react-flow__node"),
    ).toHaveCount(0);

    const saved = dashboard.page.getByTestId("pipeline-saved");
    await saved.focus();
    await expect
      .poll(() => saved.locator("option").count(), { timeout: 30_000 })
      .toBeGreaterThan(1);
    await saved.selectOption(name);

    await expect(
      dashboard.pipelinePanel.locator(".react-flow__node"),
    ).toHaveCount(1, { timeout: 60_000 });
    await expect(
      dashboard.pipelinePanel.locator(".react-flow__node"),
    ).toContainText(BASELINE);
  });

  // Both topologies, because they do not accept the same body: a
  // convolutional first stage needs [C, H, W] where a fully connected one
  // takes a flat vector. The template only ever suited the latter.
  for (const checkpoint of [BASELINE, CONV_BASELINE]) {
    test(`runs ${checkpoint} from the unedited default input`, async ({
      dashboard,
    }) => {
      await dashboard.page
        .getByTestId("pipeline-checkpoint")
        .selectOption(checkpoint);
      await dashboard.page.getByTestId("pipeline-add-node").click();

      // Deliberately no `fill`: adding a node seeds the body from that
      // checkpoint's own metadata, and clicking Run has to work from there.
      // A placeholder that cannot run is what this guards against.
      const body = await dashboard.page
        .getByTestId("pipeline-input")
        .inputValue();
      const parsed = JSON.parse(body) as {
        frames: number[][][][];
        encoded: boolean;
      };
      // A raw sample the server encodes and lays out for the topology, not a
      // pre-encoded vector that only one topology can consume.
      expect(parsed.encoded).toBe(false);
      expect(parsed.frames).toHaveLength(1);
      expect(parsed.frames[0][0]).toHaveLength(28);
      expect(parsed.frames[0][0][0]).toHaveLength(28);

      await dashboard.page.getByTestId("pipeline-run").click();

      const node = dashboard.pipelinePanel.locator(".pipeline-node");
      await expect(node).toHaveClass(/status-done/, { timeout: 300_000 });
      await expect(node.locator(".pipeline-node-predicted")).toHaveText(
        /class \d/,
      );
      await expect(dashboard.page.getByTestId("pipeline-run")).toBeEnabled();
      await expect(dashboard.errorBanner).toHaveCount(0);
    });
  }

  test("seeds the template from the source node, not the first one", async ({
    dashboard,
  }) => {
    // The source is the node with no incoming edge. Adding the downstream
    // node first puts it at index 0, which is where the template used to be
    // read from.
    await dashboard.page
      .getByTestId("pipeline-checkpoint")
      .selectOption(CONV_BASELINE);
    await dashboard.page.getByTestId("pipeline-add-node").click();
    await dashboard.page
      .getByTestId("pipeline-checkpoint")
      .selectOption(BASELINE);
    await dashboard.page.getByTestId("pipeline-add-node").click();

    await expect(
      dashboard.pipelinePanel.locator(".pipeline-node"),
    ).toHaveCount(2);
    // With no edges every node is a source, so the run body has to be one
    // both accept. Both were trained on 28x28, so there is no mismatch.
    await expect(
      dashboard.page.getByTestId("pipeline-source-mismatch"),
    ).toHaveCount(0);

    const body = await dashboard.page
      .getByTestId("pipeline-input")
      .inputValue();
    expect((JSON.parse(body) as { encoded: boolean }).encoded).toBe(false);
  });

  test("runs a chained graph end to end", async ({ dashboard }) => {
    await dashboard.page
      .getByTestId("pipeline-checkpoint")
      .selectOption(BASELINE);
    await dashboard.page.getByTestId("pipeline-add-node").click();

    await dashboard.page.getByTestId("pipeline-run").click();

    // Each node reports its own outcome on the canvas, which is the only
    // place a per-node failure in a longer chain would surface. Waiting for
    // `done` rather than for text keeps this from passing on the checkpoint
    // name, which contains a digit of its own.
    const node = dashboard.pipelinePanel.locator(".pipeline-node");
    await expect(node).toHaveClass(/status-done/, { timeout: 180_000 });
    await expect(node.locator(".pipeline-node-predicted")).toHaveText(
      /class \d/,
    );
    await expect(dashboard.page.getByTestId("pipeline-run")).toBeEnabled();
    await expect(dashboard.errorBanner).toHaveCount(0);
  });

  test("rejects input that is not valid JSON before sending it", async ({
    dashboard,
  }) => {
    await dashboard.page
      .getByTestId("pipeline-checkpoint")
      .selectOption(BASELINE);
    await dashboard.page.getByTestId("pipeline-add-node").click();
    await dashboard.page.getByTestId("pipeline-input").fill("{ not json");

    await dashboard.page.getByTestId("pipeline-run").click();

    // Caught in the browser: the server should never see this request.
    await expect(
      dashboard.pipelinePanel.locator(".mismatch"),
    ).toContainText(/not valid JSON/i);
  });

  test("reports a node that fails instead of hanging on it", async ({
    dashboard,
  }) => {
    await dashboard.page
      .getByTestId("pipeline-checkpoint")
      .selectOption(BASELINE);
    await dashboard.page.getByTestId("pipeline-add-node").click();
    await dashboard.page.getByTestId("pipeline-input").fill(WRONG_SHAPE_INPUT);

    await dashboard.page.getByTestId("pipeline-run").click();

    // A shape the checkpoint cannot consume must surface as a failed node and
    // a readable reason, and must release the run so the panel is usable
    // again. Silently staying "running" is the failure this guards against.
    const node = dashboard.pipelinePanel.locator(".pipeline-node");
    await expect(node).toHaveClass(/status-error/, { timeout: 180_000 });
    await expect(dashboard.errorBanner).toContainText(/e2e-baseline/, {
      timeout: 30_000,
    });
    await expect(dashboard.page.getByTestId("pipeline-run")).toBeEnabled();
  });

  test("rejects a well-formed payload with no frames", async ({
    dashboard,
  }) => {
    await dashboard.page
      .getByTestId("pipeline-checkpoint")
      .selectOption(BASELINE);
    await dashboard.page.getByTestId("pipeline-add-node").click();
    await dashboard.page
      .getByTestId("pipeline-input")
      .fill(JSON.stringify({ encoded: false }));

    await dashboard.page.getByTestId("pipeline-run").click();

    await expect(
      dashboard.pipelinePanel.locator(".mismatch"),
    ).toContainText(/frames/i);
  });
});
