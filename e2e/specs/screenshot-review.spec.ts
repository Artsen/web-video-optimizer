import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { fallbackJob, installMockApi, modernJob } from "../fixtures/api-routes";

if (process.env.UI_SCREENSHOT_REVIEW === "1") {
  test("captures deterministic UI-B brand review screenshots", async ({ page, browser }) => {
    const outputDir = path.join(process.cwd(), ".tmp", "ui-review");
    await mkdir(outputDir, { recursive: true });

    const capture = async (name: string, targetPage = page, fullPage = true) => {
      await targetPage.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage });
    };
    const installCompareVisualFixture = async (targetPage = page) => {
      await targetPage.addStyleTag({
        content: `
          html[data-compare-fixture="visual"] .compare-pane video {
            opacity: 0.18;
          }
          html[data-compare-fixture="visual"] .compare-media-state {
            display: none;
          }
          html[data-compare-fixture="visual"] .compare-media-stage {
            position: relative;
            overflow: hidden;
            background:
              linear-gradient(120deg, rgba(95, 111, 229, 0.24), transparent 38%),
              linear-gradient(24deg, #0b1220 0 30%, #1c2440 30% 54%, #583d48 54% 68%, #101722 68%);
          }
          html[data-compare-fixture="visual"] .compare-media-stage::before {
            position: absolute;
            inset: 9%;
            border-radius: 18px;
            background:
              radial-gradient(circle at 28% 28%, rgba(255, 255, 255, 0.72) 0 5%, transparent 5.4%),
              linear-gradient(145deg, rgba(255, 255, 255, 0.17), rgba(242, 118, 63, 0.04)),
              repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.11) 0 1px, transparent 1px 46px);
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
            content: "";
          }
          html[data-compare-fixture="visual"] .compare-pane:nth-of-type(2) .compare-media-stage::before,
          html[data-compare-fixture="visual"] .wipe-after .compare-media-stage::before {
            filter: saturate(0.82) contrast(1.05);
          }
          html[data-compare-fixture="visual"] .compare-pane:nth-of-type(3) .compare-media-stage::before {
            filter: hue-rotate(10deg) saturate(0.9);
          }
        `
      });
      await targetPage.evaluate(() => {
        document.documentElement.dataset.compareFixture = "visual";
      });
    };

    await installMockApi(page, {
      extraComparisonOutputs: true,
      storage: {
        pressure: "warning",
        reservedBytes: 500_000,
        cleanup: { staleTemporaryBytes: 250_000, staleTemporaryFileCount: 1 }
      }
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Web Video Optimizer" })).toBeVisible();
    await capture("empty-dark-desktop");
    await capture("empty-brand-field-dark");
    await capture("empty-compact-dark");

    await page.getByRole("button", { name: "Light Mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await capture("empty-light-desktop");
    await capture("empty-brand-field-light");
    await capture("empty-compact-light");

    await page.getByLabel("Choose Video").setInputFiles({
      name: "homepage-video.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("mock-video")
    });
    await expect(page.locator(".source-title-button", { hasText: "homepage-video.mp4" })).toBeVisible();
    await capture("source-light-desktop");
    await capture("source-player-controls-light");

    await page.getByRole("button", { name: "Dark Mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await capture("source-dark-desktop");
    await capture("source-no-outputs-dark");
    await capture("prepare-player-dark");
    await capture("source-player-controls-dark");

    await page.getByRole("button", { name: "Optimize For Website" }).click();
    await capture("processing-progress-dark");
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
    await capture("results-dark-desktop", page, false);
    await capture("results-selected-output-dark", page, false);
    await capture("completed-success-dark", page, false);
    await page.reload();
    await expect(page).toHaveURL(/view=results/);
    await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
    await capture("direct-results-route-reload-dark", page, false);
    await page.getByRole("button", { name: "Light Mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await capture("results-light-desktop", page, false);
    await page.getByRole("button", { name: "Dark Mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "Compare all versions" }).click();
    await expect(page.getByRole("heading", { name: "Compare" })).toBeVisible();
    await expect(page.locator(".compare-pane")).toHaveCount(3);
    await installCompareVisualFixture();
    await capture("compare-grid-dark-desktop");
    await capture("compare-3up-dark-desktop");
    await page.getByRole("button", { name: "Wipe" }).click();
    await page.getByLabel("Wipe divider position").fill("62");
    await capture("compare-wipe-dark-desktop");
    await page.getByRole("button", { name: "A/B" }).click();
    await capture("compare-ab-dark-desktop");
    await page.getByRole("button", { name: "Grid" }).click();
    await page.getByRole("button", { name: "Zoom comparison to 200%" }).click();
    await capture("compare-zoom-dark-desktop");
    await page.evaluate(() => {
      delete document.documentElement.dataset.compareFixture;
    });
    await capture("compare-unavailable-dark-desktop");
    await capture("compare-loading-dark-desktop");

    const comparePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await installMockApi(comparePage, { withHistory: true, extraComparisonOutputs: true });
    await comparePage.goto("/");
    await comparePage.locator(".sidebar-file", { hasText: "homepage-video.mp4" }).click();
    await expect(comparePage).toHaveURL(/view=results/);
    await comparePage.getByRole("button", { name: "Compare all versions" }).click();
    await expect(comparePage.getByRole("heading", { name: "Compare" })).toBeVisible();
    await comparePage.getByRole("button", { name: "4-up" }).click();
    await expect(comparePage.locator(".compare-pane")).toHaveCount(4);
    await installCompareVisualFixture(comparePage);
    await capture("compare-4up-dark-desktop", comparePage);
    await comparePage.close();

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Poster preview" })).toBeVisible();
    await capture("poster-dialog-dark");
    await page.setViewportSize({ width: 1024, height: 560 });
    await capture("poster-dialog-short-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("poster-dialog-mobile");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Source options" }).click();
    await page.getByRole("menuitem", { name: "Custom export" }).click();
    await expect(page.getByRole("heading", { name: "Custom" })).toBeVisible();
    await capture("custom-dark-desktop");

    await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Library" }).click();
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await capture("library-dark-desktop");
    await capture("storage-warning-dark");
    await capture("warning-state-dark");
    await page.getByRole("button", { name: "Light Mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await capture("library-light-desktop");
    await page.getByRole("button", { name: "Dark Mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("navigation", { name: "Primary mobile navigation" })
      .getByRole("button", { name: "Prepare" })
      .click();
    await capture("source-narrow");
    await page.getByRole("button", { name: "Jump to results" }).click();
    await expect(page).toHaveURL(/view=results/);
    await page.getByRole("button", { name: "Compare all versions" }).click();
    await page.getByRole("button", { name: "1-up" }).click();
    await capture("compare-single-narrow");
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
    await page.locator("#results").scrollIntoViewIfNeeded();
    await capture("results-narrow", page, false);
    await page.locator(".workspace").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await capture("mobile-bottom-chrome-results", page, false);

    const unreachablePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    let apiReachable = false;
    await installMockApi(unreachablePage);
    await unreachablePage.route("**/api/**", async (route) => {
      if (!apiReachable) {
        await route.abort("failed");
        return;
      }
      await route.fallback();
    });
    await unreachablePage.goto("/");
    await expect(
      unreachablePage.getByRole("alert").getByRole("heading", { name: "Cannot reach the local API" })
    ).toBeVisible();
    await capture("api-unreachable-dark-desktop", unreachablePage);
    await unreachablePage.getByRole("button", { name: "Light Mode" }).click();
    await expect(unreachablePage.locator("html")).toHaveAttribute("data-theme", "light");
    await capture("api-unreachable-light-desktop", unreachablePage);
    await unreachablePage.setViewportSize({ width: 390, height: 844 });
    await capture("api-unreachable-mobile", unreachablePage);
    apiReachable = true;
    await unreachablePage.getByRole("button", { name: "Retry connection" }).click();
    await expect(unreachablePage.getByRole("heading", { name: "Ready for a source video" })).toBeVisible();
    await capture("retry-success-light-desktop", unreachablePage);
    await unreachablePage.close();

    const degradedPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await installMockApi(degradedPage);
    await degradedPage.route("**/api/storage", async (route) => {
      await route.fulfill({ status: 500, headers: { "content-type": "application/json" }, body: "{}" });
    });
    await degradedPage.goto("/");
    await expect(degradedPage.getByRole("status")).toContainText("Storage status");
    await capture("degraded-bootstrap-dark-desktop", degradedPage);
    await degradedPage.close();
  });
}
