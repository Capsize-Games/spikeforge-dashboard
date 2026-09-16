/**
 * Every tab reveals its panel, and the strip behaves like a real tablist.
 *
 * Panels are hidden rather than unmounted (see `TabPanel`), which is what lets
 * a training run survive a tab switch -- and also what makes "is it visible"
 * the assertion that matters rather than "is it in the DOM".
 */

import { expect, test } from "../../fixtures/dashboard";
import { TAB_IDS } from "../../fixtures/dashboard-page";

test.describe("tabs", () => {
  test("offers exactly the six documented tabs", async ({ dashboard }) => {
    await expect(dashboard.tablist.getByRole("tab")).toHaveCount(
      TAB_IDS.length,
    );
  });

  for (const id of TAB_IDS) {
    test(`shows the ${id} panel and hides the others`, async ({
      dashboard,
    }) => {
      const panel = await dashboard.tab(id);
      await expect(dashboard.tabButton(id)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(panel).toHaveAttribute("aria-labelledby", `tab-${id}`);
      for (const other of TAB_IDS.filter((candidate) => candidate !== id)) {
        await expect(dashboard.panel(other)).toBeHidden();
      }
    });
  }

  test("keeps inactive panels mounted so live work is not torn down", async ({
    dashboard,
  }) => {
    await dashboard.tab("viewer");
    // Present in the DOM, just not visible: the contract `TabPanel` documents.
    for (const id of TAB_IDS) {
      await expect(dashboard.panel(id)).toHaveCount(1);
    }
  });

  test("moves the selection with the arrow keys", async ({ dashboard }) => {
    await dashboard.tab("model");
    await dashboard.tabButton("model").focus();
    await dashboard.page.keyboard.press("ArrowRight");
    await expect(dashboard.tabButton("viewer")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await dashboard.page.keyboard.press("End");
    await expect(dashboard.tabButton("pipeline")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await dashboard.page.keyboard.press("Home");
    await expect(dashboard.tabButton("model")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("remembers the open tab across a reload", async ({ dashboard }) => {
    await dashboard.tab("deploy");
    await dashboard.page.reload();
    await dashboard.waitForConnected();
    await expect(dashboard.panel("deploy")).toBeVisible();
  });
});
