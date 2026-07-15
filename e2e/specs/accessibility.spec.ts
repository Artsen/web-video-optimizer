import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { attachBrowserConsoleGate } from "../fixtures/browser-console";
import { installMockApi } from "../fixtures/api-routes";

test("poster dialog traps focus, closes on Escape, restores focus, and passes axe", async ({ page }, testInfo) => {
  const assertNoBrowserErrors = attachBrowserConsoleGate(page, testInfo);
  await installMockApi(page, { withHistory: true });

  await page.goto("/");
  await page.getByRole("button", { name: /homepage-video.mp4/ }).click();
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: /Jobs & Outputs/ })
    .click();
  const opener = page.getByRole("button", { name: "Preview" }).first();
  await opener.focus();
  await opener.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Poster preview" });
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Close poster preview" })).toBeFocused();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await assertNoBrowserErrors();
});
