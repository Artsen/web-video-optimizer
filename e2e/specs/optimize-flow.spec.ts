import { expect, test } from "@playwright/test";
import { attachBrowserConsoleGate } from "../fixtures/browser-console";
import { fallbackJob, installMockApi, modernJob } from "../fixtures/api-routes";

test("uploads a file, sends current settings to pair, subscribes to both jobs, and exposes downloads", async ({
  page
}, testInfo) => {
  const assertNoBrowserErrors = attachBrowserConsoleGate(page, testInfo);
  const api = await installMockApi(page);

  await page.goto("/");
  await page.getByLabel("Select Video").setInputFiles({
    name: "homepage-video.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not-real-media-for-mocked-ui")
  });

  await expect(page.getByLabel("Source filename")).toHaveValue("homepage-video.mp4");
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: /Jobs & Outputs/ })
    .click();
  await page.getByRole("button", { name: "Optimize For Website" }).click();

  const pairRequest = api.requests.find((request) => request.url === "/api/videos/video-1/pair");
  expect(pairRequest?.method).toBe("POST");
  expect(pairRequest?.postData).toContain('"outputContainer"');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __hasEventSource(urlPart: string): boolean }).__hasEventSource("modern-job")
      )
    )
    .toBe(true);

  await page.evaluate(
    (jobs) => {
      const emit = (window as unknown as { __emitJobEvent(urlPart: string, payload: unknown): void }).__emitJobEvent;
      emit("fallback-job", jobs[0]);
      emit("modern-job", jobs[1]);
    },
    [fallbackJob, modernJob]
  );

  await expect(page.locator(".output-kind", { hasText: "MP4 fallback" })).toBeVisible();
  await expect(page.locator(".output-kind", { hasText: "Modern AV1" })).toBeVisible();
  await expect(page.getByText("WebP poster")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: /^Download$/ })
    .first()
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).not.toHaveLength(0);

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Poster preview" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Poster preview" })).toBeHidden();

  await assertNoBrowserErrors();
});

test("supports custom optimization failure presentation without console errors", async ({ page }, testInfo) => {
  const assertNoBrowserErrors = attachBrowserConsoleGate(page, testInfo, {
    allowConsoleError: (text) => text.includes("400 (Bad Request)")
  });
  await installMockApi(page);
  await page.route("**/api/videos/video-1/jobs", async (route) => {
    await route.fulfill({
      status: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Request validation failed.", code: "VALIDATION_ERROR" })
    });
  });

  await page.goto("/");
  await page.getByLabel("Select Video").setInputFiles({
    name: "homepage-video.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("mock")
  });
  await page.getByRole("navigation", { name: "Workspace views" }).getByRole("button", { name: "Custom" }).click();
  await page.getByRole("button", { name: "Export Current Settings" }).click();
  await expect(page.locator(".global-error", { hasText: "Request validation failed." })).toBeVisible();
  await assertNoBrowserErrors();
});
