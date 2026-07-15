import type { Page, TestInfo } from "@playwright/test";

type BrowserConsoleGateOptions = {
  allowConsoleError?: (text: string) => boolean;
  allowRequestFailure?: (text: string) => boolean;
};

export function attachBrowserConsoleGate(page: Page, testInfo: TestInfo, options: BrowserConsoleGateOptions = {}) {
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (options.allowConsoleError?.(text)) return;
    errors.push(`console error: ${text}`);
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    const text = `request failed: ${request.method()} ${request.url()} ${failure?.errorText ?? ""}`.trim();
    if (text.includes("net::ERR_ABORTED") && (text.includes("/download") || text.includes("/source"))) return;
    if (options.allowRequestFailure?.(text)) return;
    errors.push(text);
  });

  return async () => {
    if (errors.length > 0) {
      await testInfo.attach("browser-errors", {
        body: errors.join("\n"),
        contentType: "text/plain"
      });
      throw new Error(`Unexpected browser errors on ${page.url()}:\n${errors.join("\n")}`);
    }
  };
}
