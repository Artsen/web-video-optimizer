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
  await page.getByRole("button", { name: /homepage-video.mp4/ }).click();
  await expect(page.getByLabel("Source filename")).toHaveValue("homepage-video.mp4");

  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: /Jobs & Outputs/ })
    .click();
  await expect(page.locator(".output-kind", { hasText: "MP4 fallback" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.evaluate((job) => {
    const emit = (window as unknown as { __emitJobEvent(urlPart: string, payload: unknown): void }).__emitJobEvent;
    emit("subtitle-job", job);
  }, subtitleJob);

  await page.getByRole("button", { name: "Manage Library" }).click();
  await page.locator(".history-main").filter({ hasText: "homepage-video.mp4" }).click();
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: /Jobs & Outputs/ })
    .click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel(/WebVTT captions/)).toBeVisible();
  await page.getByLabel(/WebVTT captions/).fill("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nUpdated.\n");
  await page.getByRole("button", { name: "Save Captions" }).click();
  await expect.poll(() => api.requests.some((request) => request.url === "/api/jobs/subtitle-job/captions")).toBe(true);

  const captionsAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(captionsAxe.violations).toEqual([]);

  await page.getByRole("button", { name: "Back To Outputs" }).click();
  await page.getByRole("button", { name: "Build Download Package" }).click();
  expect(api.requests.some((request) => request.url === "/api/videos/video-1/package")).toBe(true);

  await page.getByRole("button", { name: "Manage Library" }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Delete Selected" }).click();
  expect(api.requests.some((request) => request.url === "/api/history/delete")).toBe(true);

  await assertNoBrowserErrors();
});
