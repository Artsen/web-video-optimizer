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
  await page.getByRole("button", { name: "New Video" }).click();
  await expect(page.getByRole("heading", { name: "Add a source video" })).toBeVisible();
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByText(/Storage looks healthy|Storage is getting low|Storage is critically low/)).toBeVisible({
    timeout: 30_000
  });
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Prepare" }).click();

  await page.getByLabel("Choose Video").setInputFiles(videoPath);
  await expect(page.locator(".source-title-button", { hasText: "tiny-e2e-video.mp4" })).toBeVisible();
  await expect(page.getByText("160 x 90").first()).toBeVisible();

  await page.getByRole("button", { name: "Source options" }).click();
  await page.getByRole("menuitem", { name: "Custom export" }).click();
  await page.getByText("Advanced settings").click();
  await page.getByRole("slider", { name: /CRF/ }).fill("34");
  await page.getByRole("button", { name: "Export Current Settings" }).click();
  await expect(page.locator(".output-kind", { hasText: /MP4 fallback|Custom export/ }).first()).toBeVisible();
  await expect(page).toHaveURL(/view=results/);
  await expect(
    page
      .getByRole("article")
      .getByRole("link", { name: /^Download$/ })
      .first()
  ).toBeVisible({
    timeout: 60_000
  });

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Prepare" }).click();
  await page.locator(".source-inspector").getByText("Source actions").click();
  const sourceDownloadLink = page.getByRole("link", { name: "Download Original Source" });
  const sourceDownloadHref = await sourceDownloadLink.getAttribute("href");
  expect(sourceDownloadHref).toContain("/api/videos/");
  const sourceDownload = await page.request.get(sourceDownloadHref!);
  expect(sourceDownload.status(), `${sourceDownloadHref}: ${await sourceDownload.text()}`).toBe(200);
  expect(sourceDownload.headers()["content-disposition"]).toContain("tiny-e2e-video");
  expect((await sourceDownload.body()).length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Jump to results" }).click();
  await expect(page).toHaveURL(/view=results/);
  const outputDownload = page.waitForEvent("download");
  await page
    .getByRole("link", { name: /^Download$/ })
    .first()
    .click();
  expect((await outputDownload).suggestedFilename()).not.toHaveLength(0);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await page.getByText("Review storage").click();
  await expect(page.getByText(/available on disk/)).toBeVisible({ timeout: 30_000 });
  const cleanupButton = page.getByRole("button", { name: "Clean temporary files only" });
  await expect(cleanupButton).toBeVisible();
  if (await cleanupButton.isEnabled()) {
    await cleanupButton.click();
    await expect(page.getByText(/Reclaimed .* temporary file/)).toBeVisible();
  }
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No uploaded files yet.")).toBeVisible();
  await assertNoBrowserErrors();
});
