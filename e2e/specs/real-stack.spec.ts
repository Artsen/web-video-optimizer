import { expect, test } from "@playwright/test";
import { attachBrowserConsoleGate } from "../fixtures/browser-console";
import { createTinyVideoFixture } from "../fixtures/media-fixture";

test("uploads and optimizes a tiny real video through the compiled stack @real-stack", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const assertNoBrowserErrors = attachBrowserConsoleGate(page, testInfo, {
    allowRequestFailure: (text) => text.includes("/download") && text.includes("net::ERR_ABORTED")
  });
  const videoPath = await createTinyVideoFixture(testInfo.outputDir);

  await page.goto("/");
  await expect(page.getByText("No uploads yet.")).toBeVisible();
  await page.getByRole("button", { name: "Manage Library" }).click();
  await expect(page.getByRole("heading", { name: "Storage" })).toBeVisible();
  await expect(page.getByText(/managed by this app/)).toBeVisible();
  await page.getByRole("button", { name: "Workflow" }).click();

  await page.getByLabel("Select Video").setInputFiles(videoPath);
  await expect(page.getByLabel("Source filename")).toHaveValue("tiny-e2e-video.mp4");
  await expect(page.getByText(/Source is .*160 x 90/)).toBeVisible();

  await page.getByRole("navigation", { name: "Workspace views" }).getByRole("button", { name: "Custom" }).click();
  await page.getByRole("slider", { name: /CRF/ }).fill("34");
  await page.getByRole("button", { name: "Export Current Settings" }).click();
  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: /Jobs & Outputs/ })
    .click();
  await expect(page.locator(".output-kind", { hasText: /MP4 fallback|Custom export/ })).toBeVisible();
  await expect(page.getByText("completed")).toBeVisible({ timeout: 60_000 });

  await page.getByRole("navigation", { name: "Workspace views" }).getByRole("button", { name: "Prepare" }).click();
  const sourceDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download Original Source" }).click();
  expect((await sourceDownload).suggestedFilename()).toContain("tiny-e2e-video");

  await page
    .getByRole("navigation", { name: "Workspace views" })
    .getByRole("button", { name: /Jobs & Outputs/ })
    .click();
  const outputDownload = page.waitForEvent("download");
  await page
    .getByRole("link", { name: /^Download$/ })
    .first()
    .click();
  expect((await outputDownload).suggestedFilename()).not.toHaveLength(0);

  await page.getByRole("button", { name: "Manage Library" }).click();
  await expect(page.getByText(/available on disk/)).toBeVisible();
  const cleanupButton = page.getByRole("button", { name: "Clean temporary files only" });
  await expect(cleanupButton).toBeVisible();
  if (await cleanupButton.isEnabled()) {
    await cleanupButton.click();
    await expect(page.getByText(/Reclaimed .* temporary file/)).toBeVisible();
  }
  await page.getByRole("button", { name: "Delete file" }).click();
  await expect(page.getByText("No uploaded files yet.")).toBeVisible();
  await assertNoBrowserErrors();
});
