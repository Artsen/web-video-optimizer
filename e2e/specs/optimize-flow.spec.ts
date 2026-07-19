import { expect, test } from "@playwright/test";
import { attachBrowserConsoleGate } from "../fixtures/browser-console";
import { fallbackJob, installMockApi, modernJob } from "../fixtures/api-routes";

test("uploads a file, sends current settings to pair, subscribes to both jobs, and exposes downloads", async ({
  page
}, testInfo) => {
  const assertNoBrowserErrors = attachBrowserConsoleGate(page, testInfo);
  const api = await installMockApi(page);

  await page.goto("/");
  await page.getByLabel("Choose Video").setInputFiles({
    name: "homepage-video.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not-real-media-for-mocked-ui")
  });

  await expect(page.locator(".source-title-button", { hasText: "homepage-video.mp4" })).toBeVisible();
  await expect(page).toHaveURL(/view=prepare/);
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

  await expect(page).toHaveURL(/view=results/);
  await expect(page.locator(".output-kind", { hasText: "MP4 fallback" })).toBeVisible();
  const resultsHeadingBox = await page.getByRole("heading", { name: "Results" }).boundingBox();
  expect(resultsHeadingBox ? resultsHeadingBox.y >= 0 : false).toBe(true);
  await expect(page.locator(".output-kind", { hasText: "Modern AV1" })).toBeVisible();
  await expect(page.locator(".output-kind", { hasText: "WebP poster" })).toBeVisible();

  await page.getByRole("button", { name: "Compare all versions" }).click();
  await expect(page.getByRole("heading", { name: "Compare" })).toBeVisible();
  await expect(page.locator(".compare-pane")).toHaveCount(3);
  await expect(page.getByRole("group", { name: "Synchronized comparison controls" })).toBeVisible();
  await page.getByRole("button", { name: "2-up" }).click();
  await expect(page).toHaveURL(/layout=two/);
  await expect(page).toHaveURL(/versions=/);
  await page.getByLabel("Comparison audio source").selectOption("modern-job");
  await expect(page.getByLabel("Comparison audio source")).toHaveValue("modern-job");
  await page.getByRole("button", { name: "Wipe" }).click();
  await expect(page).toHaveURL(/mode=wipe/);
  await expect(page.getByTestId("compare-wipe")).toBeVisible();
  await page.getByLabel("Wipe divider position").fill("64");
  await expect(page.getByLabel("Wipe divider position")).toHaveValue("64");
  await expect(page).not.toHaveURL(/wipe=64|time=|zoom=|pan=/);
  await page.getByRole("button", { name: "A/B" }).click();
  const abCompare = page.getByTestId("compare-ab");
  await expect(abCompare).toBeVisible();
  await expect(abCompare.locator(".ab-shortcut")).toBeVisible();
  const helperBox = await abCompare.locator(".ab-shortcut").boundingBox();
  const footerBox = await abCompare.locator(".compare-pane-footer").boundingBox();
  expect(helperBox && footerBox ? helperBox.y + helperBox.height < footerBox.y : false).toBe(true);
  await abCompare.getByRole("button", { name: "Original", exact: true }).click();
  await expect(abCompare.getByRole("button", { name: "Original", exact: true })).toHaveClass(/active/);
  await page.keyboard.down("o");
  await page.keyboard.up("o");
  await page.getByRole("button", { name: "Grid" }).click();
  await page.getByRole("button", { name: "Zoom comparison to 200%" }).click();
  await page.getByRole("button", { name: "Reset comparison view" }).click();
  await page.getByRole("button", { name: "Next approximate frame" }).click();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();

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
  await page.getByLabel("Choose Video").setInputFiles({
    name: "homepage-video.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("mock")
  });
  await page.getByRole("button", { name: "Source options" }).click();
  await page.getByRole("menuitem", { name: "Custom export" }).click();
  await page.getByRole("button", { name: "Export Current Settings" }).click();
  await expect(page).toHaveURL(/view=custom/);
  await expect(page.locator(".global-error", { hasText: "Request validation failed." })).toBeVisible();
  await assertNoBrowserErrors();
});
