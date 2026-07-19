import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installMockApi } from "../fixtures/api-routes";
import { attachBrowserConsoleGate } from "../fixtures/browser-console";

test("shows storage pressure, cleans temporary files, and remains accessible", async ({ page }, testInfo) => {
  const assertNoBrowserErrors = attachBrowserConsoleGate(page, testInfo);
  const api = await installMockApi(page, {
    storage: {
      pressure: "critical",
      availableBytes: 5_000_000,
      configuredMaxBytes: 20_000_000,
      cleanup: { staleTemporaryBytes: 250_000, staleTemporaryFileCount: 1 }
    }
  });

  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByText(/Storage is critically low/)).toBeVisible();
  await page.getByText("Review storage").click();
  await expect(page.getByText(/Reclaimable temporary data/)).toBeVisible();

  await page.keyboard.press("Tab");
  await page.getByRole("button", { name: "Clean temporary files only" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Reclaimed 1 temporary file(s).")).toBeVisible();
  await expect.poll(() => api.requests.some((request) => request.url === "/api/storage/cleanup")).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.locator("body").evaluate((body) => body.scrollWidth > body.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
  await assertNoBrowserErrors();
});
