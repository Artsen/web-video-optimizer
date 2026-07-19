# Testing

The project uses layered tests so most behavior can be checked quickly, while browser and real-media paths still run before merge.

## Command Summary

| Command                          | Purpose                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| `npm run format:check`           | Verifies Prettier formatting.                                        |
| `npm run lint`                   | Runs ESLint across packages and apps.                                |
| `npm run typecheck`              | Runs TypeScript checks.                                              |
| `npm run test:run`               | Runs unit tests once.                                                |
| `npm run test:coverage`          | Runs unit tests with coverage.                                       |
| `npm run build`                  | Builds packages, API, and web app.                                   |
| `npm run check`                  | Runs format, lint, typecheck, tests, and build.                      |
| `npm run test:e2e`               | Runs Playwright browser tests.                                       |
| `npm run test:integration:media` | Builds the app and runs compiled API tests with real FFmpeg/FFprobe. |
| `npm run review:ui-screens`      | Captures deterministic UI screenshots into `.tmp/ui-review/`.        |
| `npm audit --omit=dev`           | Checks production dependency advisories.                             |

## Recommended Local Flow

Run the fast gate while editing:

```powershell
npm run check
```

Before opening or merging a pull request, also run:

```powershell
npm run test:coverage
npm audit --omit=dev
npm run test:e2e
npm run test:integration:media
git diff --check
```

If you changed UI presentation, run:

```powershell
npm run review:ui-screens
```

The screenshot command writes to `.tmp/ui-review/`; those files are for local review and should not be committed unless a specific docs task curates copies into `docs/assets/screenshots/`.

## Unit Tests

Unit tests cover:

- shared contract schemas
- video-core helpers for filenames, encoding settings, FFmpeg arguments, metadata, and progress parsing
- API config parsing, request validation, route behavior, repositories, services, storage boundaries, capacity policy, reservations, persistence, scheduler behavior, process handling, cleanup, packages, captions, and downloads
- frontend route state, API client behavior, job event wiring, feature derivations, component behavior, compare state, poster dialog accessibility, and upload workflows

Unit tests use Vitest and should not require real media tools.

## Browser E2E

Playwright tests run against the compiled web and API stack. They include:

- empty app shell navigation and theme checks
- upload and optimize request flow
- library, captions, package, and representative accessibility scans
- poster dialog focus trapping and Escape handling
- custom optimization error presentation without console errors
- a tiny real-stack browser encode path

The E2E runner fails on unexpected browser console errors and failed requests. Diagnostic output is written to `playwright-report/` and `test-results/` on failure.

## Real-Media Integration

The compiled API media integration suite requires FFmpeg and FFprobe on PATH. It verifies:

- health and capability endpoints
- upload and duplicate detection
- metadata inspection
- MP4 and WebM encoding
- HTTP byte ranges, including suffix ranges used by browser media playback
- poster generation
- package creation
- privacy of DTOs
- cleanup and deletion
- timeout cleanup and later work acceptance
- graceful shutdown and recovery states
- scheduler FIFO behavior and cancelation paths

Because it runs real media commands, this suite is slower than unit tests but catches bugs that mocked process tests cannot.

## Optional Tool Workflows

yt-dlp and whisper.cpp are optional. Tests use mocks for most optional-tool behavior so contributors can run the default suite without installing them. When changing YouTube import or caption generation, also perform a manual smoke test with the tools configured locally.

## Local Failure Notes

- If PowerShell blocks `npm.ps1`, use `npm.cmd`.
- If `npm ci` fails on Windows with a locked Rollup or Vite binary, stop stale project Node processes and rerun the failed command.
- If browser E2E leaves a locked temp directory, close any running test/dev process and rerun.
- If real-media integration fails because FFmpeg is missing, install FFmpeg and confirm `ffmpeg -version` and `ffprobe -version`.
