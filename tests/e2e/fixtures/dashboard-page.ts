/**
 * Page object for the dashboard.
 *
 * Specs address the application through this class so they never encode the
 * difference between a Chromium tab and the Electron window, and so a renamed
 * CSS class breaks one file instead of twenty. The shell plumbing it extends
 * -- loading, tabs, canvases, the raw protocol -- lives in `DashboardShell`.
 *
 * Two selector conventions are in play, both deliberate:
 *
 * - **Panels** are addressed by the `data-tour` attribute they already carry
 *   for the guided tour. Those hooks are load-bearing product code, so a spec
 *   that uses one cannot drift away from what the tour points at.
 * - **Controls** are addressed by `data-testid`, and labelled fields by
 *   `data-field`. The interface is translated into eight languages, so button
 *   text is not a selector.
 */

import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

import { DashboardShell } from "./dashboard-shell";

export { TAB_IDS } from "./dashboard-shell";
export type { TabId } from "./dashboard-shell";

export class DashboardPage extends DashboardShell {
  // --- model & data -----------------------------------------------------

  get modelPanel(): Locator {
    return this.page.getByTestId("model-panel");
  }

  /** Name of the currently loaded checkpoint, or the "none" placeholder. */
  get currentModel(): Locator {
    return this.page.getByTestId("model-current");
  }

  get datasetSelect(): Locator {
    return this.panel("model").locator('[data-tour="dataset"] select');
  }

  /** Save the loaded checkpoint under `name` through the model panel. */
  async saveModel(name: string): Promise<void> {
    await this.page.getByTestId("model-tab-save").click();
    await this.page.getByTestId("model-name").fill(name);
    await this.page.getByTestId("model-save").click();
  }

  /** Load a saved checkpoint by name through the model panel. */
  async loadModel(name: string): Promise<void> {
    await this.page.getByTestId("model-tab-load").click();
    await this.page.getByTestId("model-select").selectOption(name);
    await this.page.getByTestId("model-load").click();
  }

  /** Names of the checkpoints the server has told the interface about. */
  async savedModels(): Promise<string[]> {
    await this.page.getByTestId("model-tab-load").click();
    const values = await this.page
      .getByTestId("model-select")
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value),
      );
    return values.filter((value) => value !== "");
  }

  /**
   * A labelled control, addressed by the `data-field` hook `NumberField` and
   * `SelectField` carry. Field labels like `epochs` and `subset` are the
   * server's own parameter names and are not translated, which is what makes
   * them usable as selectors.
   */
  field(label: string): Locator {
    return this.page.locator(`[data-field="${label}"]`);
  }

  /**
   * Type into a labelled numeric field and wait for it to echo the value.
   *
   * Every numeric parameter is drawn as a box — the ones with a range beside
   * them commit through the same box — so this is the one way to set any of
   * them, and it fails loudly if a field stops being editable.
   */
  async setField(label: string, value: number): Promise<void> {
    const box = this.field(label).locator(".num-input");
    await box.fill(String(value));
    await box.press("Enter");
    await expect(box).toHaveValue(String(value));
  }

  // --- training ---------------------------------------------------------

  /**
   * Shrink the run to something a CPU finishes in a reasonable time.
   *
   * These are the same fields a user types into. Accuracy is irrelevant here
   * -- what is under test is that the whole training path runs and reports.
   *
   * `subset` is a **divisor, not a percentage**: `build_loader` reduces the
   * split to `len / subset`, and skips the reduction entirely when it is 1.
   * The maximum is therefore the fastest setting, and 1 is the full
   * 60,000-sample dataset. Setting it to 1 here cost about sixty times the
   * work it should have -- which no fully connected run was slow enough to
   * expose, and no convolutional run was fast enough to survive.
   */
  async useFastTrainingConfig(): Promise<void> {
    await this.tab("model");
    await this.setField("epochs", 1);
    await this.setField("subset", 50);
    await this.setField("num_steps", 10);
    await this.setField("hidden", 64);
    await this.setField("batch_size", 64);
  }

  /** The architecture picker, addressed by its guided-tour hook. */
  get topologySelect(): Locator {
    return this.tourTarget("topology").locator("select");
  }

  /** Train the current configuration and wait for the run to finish. */
  async trainToCompletion(timeout = 900_000): Promise<void> {
    await expect(this.trainStart).toBeEnabled();
    await this.trainStart.click();
    await expect(this.trainStop).toBeEnabled({ timeout: 120_000 });
    await expect(this.trainStop).toBeDisabled({ timeout });
    await expect(this.trainStart).toBeEnabled();
  }

  get trainStart(): Locator {
    return this.page.getByTestId("train-start");
  }

  get trainStop(): Locator {
    return this.page.getByTestId("train-stop");
  }

  /** The live metrics row, present only once the first step has reported. */
  get trainingLive(): Locator {
    return this.tourTarget("training-live");
  }

  // --- viewer -----------------------------------------------------------

  get predictionPanel(): Locator {
    return this.page.getByTestId("prediction-panel");
  }

  get predictionValue(): Locator {
    return this.page.getByTestId("prediction-value");
  }

  /**
   * The auto-predict checkbox. It is visually hidden behind a styled track
   * (`.toggle input` is 0x0 with zero opacity), so it can be read for state
   * but never clicked -- use `setAutoPredict`.
   */
  get autoPredict(): Locator {
    return this.page.getByTestId("auto-predict");
  }

  /** Switch auto-prediction on or off the way the styled toggle is clicked. */
  async setAutoPredict(on: boolean): Promise<void> {
    if ((await this.autoPredict.isChecked()) === on) return;
    await this.predictionPanel.locator("label.toggle").click();
    await expect(this.autoPredict).toBeChecked({ checked: on });
  }

  // --- deployment -------------------------------------------------------

  get energyRun(): Locator {
    return this.page.getByTestId("energy-run");
  }

  get energyTarget(): Locator {
    return this.page.getByTestId("energy-target");
  }

  get energyReport(): Locator {
    return this.page.getByTestId("energy-report");
  }

  // --- hub --------------------------------------------------------------

  get hubList(): Locator {
    return this.page.getByTestId("hub-list");
  }

  get hubSearchInput(): Locator {
    return this.page.getByTestId("hub-search-input");
  }

  get hubSearch(): Locator {
    return this.page.getByTestId("hub-search");
  }

  // --- pipeline ---------------------------------------------------------

  get pipelinePanel(): Locator {
    return this.page.getByTestId("pipeline-panel");
  }

  get pipelineStatus(): Locator {
    return this.page.getByTestId("pipeline-status");
  }

  /**
   * Open a raw protocol socket from inside the page and collect replies.
   *
   * Some contracts -- the version handshake, an unsolicited server error --
   * have no interface affordance to drive them through. Running the socket in
   * the page keeps the origin and any access token identical to the one the
   * application itself uses.
   */
  async protocolExchange(
    messages: Record<string, unknown>[],
    settleMs = 4_000,
  ): Promise<{ type: string; payload?: unknown }[]> {
    return this.page.evaluate(
      async ([outbound, settle]) => {
        const scheme = location.protocol === "https:" ? "wss" : "ws";
        const socket = new WebSocket(`${scheme}://${location.host}/ws`);
        const received: { type: string; payload?: unknown }[] = [];
        await new Promise<void>((resolve, reject) => {
          socket.onopen = () => resolve();
          socket.onerror = () => reject(new Error("socket failed to open"));
        });
        socket.onmessage = (event) =>
          received.push(JSON.parse(event.data as string));
        for (const message of outbound as Record<string, unknown>[]) {
          socket.send(JSON.stringify(message));
        }
        await new Promise((resolve) => setTimeout(resolve, settle as number));
        socket.close();
        return received;
      },
      [messages, settleMs] as const,
    );
  }
}
