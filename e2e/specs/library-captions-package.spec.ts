import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { attachBrowserConsoleGate } from "../fixtures/browser-console";
import { installMockApi, subtitleJob } from "../fixtures/api-routes";

test("restores history, edits captions, creates a package, and passes representative axe scans", async ({
  page
}, testInfo) => {
  const assertNoBrowserErrors = attachBrowserConsoleGate(page, testInfo);
  const api = await installMockApi(page, { withHistory: true });

  await page.goto("/");
  await page.locator(".sidebar-file", { hasText: "homepage-video.mp4" }).click();

  await expect(page).toHaveURL(/view=results/);
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(page.locator(".output-kind", { hasText: "MP4 fallback" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.evaluate((job) => {
    const emit = (window as unknown as { __emitJobEvent(urlPart: string, payload: unknown): void }).__emitJobEvent;
    emit("subtitle-job", job);
  }, subtitleJob);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Library" }).click();
  await page.locator(".history-main").filter({ hasText: "homepage-video.mp4" }).click();
  await expect(page).toHaveURL(/view=results/);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel(/WebVTT captions/)).toBeVisible();
  await page.getByLabel(/WebVTT captions/).fill("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nUpdated.\n");
  await page.getByRole("button", { name: "Save Captions" }).click();
  await expect.poll(() => api.requests.some((request) => request.url === "/api/jobs/subtitle-job/captions")).toBe(true);

  const captionsAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(captionsAxe.violations).toEqual([]);

  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await page.getByRole("button", { name: "Build Package" }).click();
  expect(api.requests.some((request) => request.url === "/api/videos/video-1/package")).toBe(true);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Library" }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Delete" }).click();
  expect(api.requests.some((request) => request.url === "/api/history/delete")).toBe(true);

  await assertNoBrowserErrors();
});

test("opens processed sources to results and unprocessed sources to prepare", async ({ page }, testInfo) => {
  const assertNoBrowserErrors = attachBrowserConsoleGate(page, testInfo);
  await installMockApi(page, { withHistory: true, withUnprocessedSource: true });

  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Library" }).click();
  await page.locator(".history-main").filter({ hasText: "homepage-video.mp4" }).click();
  await expect(page).toHaveURL(/view=results/);
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/view=results/);
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Prepare" }).click();
  await expect(page).toHaveURL(/view=prepare/);
  await page.goBack();
  await expect(page).toHaveURL(/view=results/);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Library" }).click();
  await page.locator(".history-main").filter({ hasText: "raw-upload.mp4" }).click();
  await expect(page).toHaveURL(/view=prepare/);
  await expect(page.getByRole("heading", { name: "Prepare" })).toBeVisible();
  await assertNoBrowserErrors();
});

test("keeps final mobile result controls above the bottom navigation", async ({ page }, testInfo) => {
  const assertNoBrowserErrors = attachBrowserConsoleGate(page, testInfo);
  await installMockApi(page, { withHistory: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?view=results&source=video-1");
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await page.locator(".workspace").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  const packageBar = page.locator(".package-bottom-bar");
  const bottomNav = page.getByRole("navigation", { name: "Primary mobile navigation" });
  await expect(packageBar).toBeVisible();
  await expect(bottomNav).toBeVisible();

  const packageBarBox = await packageBar.boundingBox();
  const bottomNavBox = await bottomNav.boundingBox();
  expect(packageBarBox && bottomNavBox ? packageBarBox.y + packageBarBox.height < bottomNavBox.y : false).toBe(true);
  await assertNoBrowserErrors();
});
