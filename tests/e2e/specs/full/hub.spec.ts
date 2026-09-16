/**
 * Browsing the model hub.
 *
 * The catalog ships with the hub distribution and resolves offline, so every
 * assertion here holds on a machine with no network access. Downloading a real
 * artifact is deliberately not covered: it would make the suite depend on a
 * third-party host being up, which is exactly the kind of flake that gets a
 * test suite ignored.
 */

import { expect, test } from "../../fixtures/dashboard";

test.describe("hub", () => {
  test.beforeEach(async ({ dashboard }) => {
    await dashboard.waitForBootstrap();
    await dashboard.tab("hub");
    await expect(dashboard.hubList).toBeVisible({ timeout: 60_000 });
  });

  test("lists catalog entries with their provenance", async ({ dashboard }) => {
    const entries = dashboard.hubList.locator("li");
    await expect.poll(() => entries.count()).toBeGreaterThan(0);

    // Every entry has to carry a licence and a framework: an artifact a user
    // cannot attribute is one they cannot legally deploy.
    const first = entries.first();
    await expect(first).toContainText(/snntorch|nir|onnx|pytorch/i);
    await expect(first).toContainText(/BSD|MIT|Apache|CC/i);
  });

  test("filters the catalog by framework", async ({ dashboard }) => {
    const entries = dashboard.hubList.locator("li");
    const before = await entries.count();

    await dashboard.page.getByLabel(/framework/i).selectOption("snntorch");
    await expect
      .poll(() => dashboard.hubList.locator("li").count(), { timeout: 30_000 })
      .toBeGreaterThan(0);

    const after = await dashboard.hubList.locator("li").count();
    expect(after).toBeLessThanOrEqual(before);
    for (const entry of await dashboard.hubList.locator("li").all()) {
      await expect(entry).toContainText(/snntorch/i);
    }
  });

  test("searches the catalog and reports live-search availability", async ({
    dashboard,
  }) => {
    await dashboard.hubSearchInput.fill("mnist");
    await dashboard.hubSearch.click();

    const caption = dashboard.page.locator(".hub-search-caption");
    await expect(caption).toBeVisible({ timeout: 60_000 });
    await expect(caption).toContainText(/search .mnist./);
    // Whether the remote index is reachable is a fact about this machine, but
    // the interface must state which it got rather than leave it ambiguous.
    await expect(caption).toContainText(
      /live search (available|unavailable)/i,
    );
  });

  test("an empty search says so rather than showing a stale list", async ({
    dashboard,
  }) => {
    await dashboard.hubSearchInput.fill("zzz-no-such-model-zzz");
    await dashboard.hubSearch.click();

    // Scoped to the hub panel: every tab keeps its panels mounted, and a
    // dozen of them carry an empty-state note of their own.
    await expect(
      dashboard.tourTarget("hub").locator(".panel-note"),
    ).toBeVisible({ timeout: 60_000 });
    await expect(dashboard.hubList).toHaveCount(0);
  });

  test("selecting an entry reveals its actions", async ({ dashboard }) => {
    const first = dashboard.hubList.locator("li").first();
    await expect(first.locator(".hub-actions")).toHaveCount(0);

    await first.locator(".hub-card-main").click();

    // Download, inspect, and import only appear for the selected entry, so a
    // user cannot act on one row while reading another.
    await expect(first.locator(".hub-card-main")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const actions = first.locator(".hub-actions button");
    await expect(actions).toHaveCount(3);
    await expect(actions).toHaveText(["download", "inspect", "import"]);
  });
});
