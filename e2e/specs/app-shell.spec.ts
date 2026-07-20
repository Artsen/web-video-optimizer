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
  await expect(page.getByText("Choose Video")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Results" })).toHaveCount(
    0
  );

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Prepare" }).click();

  await page.getByRole("button", { name: "Light Mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "Primary mobile navigation" }).getByRole("button", { name: "Results" })
  ).toHaveCount(0);
  const hasHorizontalOverflow = await page.locator("body").evaluate((body) => body.scrollWidth > body.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
  expect(api.requests.map((request) => request.url)).toContain("/api/capabilities");
  expect(api.requests.map((request) => request.url)).toContain("/api/history");
  await assertNoBrowserErrors();
});

test("shows API-unreachable startup state and retries successfully", async ({ page }, testInfo) => {
  const assertNoBrowserErrors = attachBrowserConsoleGate(page, testInfo, {
    allowConsoleError: (text) => text === "Failed to load resource: net::ERR_FAILED",
    allowRequestFailure: (text) => text.includes("http://127.0.0.1:4100/api/") && text.includes("net::ERR_FAILED")
  });
  let apiReachable = false;

  await installMockApi(page);
  await page.route("**/api/**", async (route) => {
    if (!apiReachable) {
      await route.abort("failed");
      return;
    }
    await route.fallback();
  });

  await page.goto("/");
  await expect(page.getByRole("alert").getByRole("heading", { name: "Cannot reach the local API" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("http://127.0.0.1:4100");

  apiReachable = true;
  await page.getByRole("button", { name: "Retry connection" }).click();

  await expect(page.getByRole("heading", { name: "Ready for a source video" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await assertNoBrowserErrors();
});
