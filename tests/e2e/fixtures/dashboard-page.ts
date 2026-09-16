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
   * A labelled control, addressed by the `data-field` hook `SliderField` and
   * `SelectField` carry. Field labels like `epochs` and `subset` are the
   * server's own parameter names and are not translated, which is what makes
   * them usable as selectors.
   */
  field(label: string): Locator {
    return this.page.locator(`[data-field="${label}"]`);
  }

  /** Set a range slider and wait for the interface to echo the new value. */
  async setSlider(label: string, value: number): Promise<void> {
    const field = this.field(label);
    await field.locator('input[type="range"]').fill(String(value));
    await expect(field.locator("b")).toHaveText(String(value));
  }

  // --- training ---------------------------------------------------------

  /**
   * Shrink the run to something a CPU finishes in a reasonable time.
   *
   * These are the same sliders a user drags; the defaults (3 epochs over 10%
   * of MNIST at 100 time steps with 256 hidden units) are tuned for a real
   * session, not for a test. Accuracy is irrelevant here -- what is under test
   * is that the whole training path runs and reports.
   */
  async useFastTrainingConfig(): Promise<void> {
    await this.tab("model");
    await this.setSlider("epochs", 1);
    await this.setSlider("subset", 1);
    await this.setSlider("num_steps", 10);
    await this.setSlider("hidden", 64);
    await this.setSlider("batch_size", 64);
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
