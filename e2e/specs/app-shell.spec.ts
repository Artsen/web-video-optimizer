import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { attachBrowserConsoleGate } from "../fixtures/browser-console";
import { installMockApi } from "../fixtures/api-routes";

test("loads the empty app, navigates, toggles theme, and passes an empty-state axe scan", async ({
  page
}, testInfo) => {
  const assertNoBrowserErrors = attachBrowserConsoleGate(page, testInfo);
  const api = await installMockApi(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Web Video Optimizer" })).toBeVisible();
  await expect(page.getByText("No uploads yet.")).toBeVisible();
  await expect(page.getByText("Select Video")).toBeVisible();

  await page.getByRole("button", { name: "Manage Library" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await page.getByRole("button", { name: "Workflow" }).click();

  await page.getByRole("button", { name: "Light Mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.locator("body").evaluate((body) => body.scrollWidth > body.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
  expect(api.requests.map((request) => request.url)).toContain("/api/capabilities");
  expect(api.requests.map((request) => request.url)).toContain("/api/history");
  await assertNoBrowserErrors();
});
