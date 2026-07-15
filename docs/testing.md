# Testing And Quality Checks

This repository uses npm workspaces for the shared contracts package, API, and web app.

## Requirements

- Node.js 20 or newer
- npm
- FFmpeg and FFprobe for running the application locally

Install dependencies from a clean checkout with:

```bash
npm ci
```

## Commands

Run ESLint:

```bash
npm run lint
```

Format files with Prettier:

```bash
npm run format
```

Check formatting without changing files:

```bash
npm run format:check
```

Run TypeScript checks:

```bash
npm run typecheck
```

Run unit tests once:

```bash
npm run test:run
```

Run only the shared contracts tests:

```bash
npm run test:run --workspace packages/contracts
```

Run only the pure video-core tests:

```bash
npm run test:run --workspace packages/video-core
```

Run only the API tests:

```bash
npm run test:run --workspace apps/api
```

Run unit tests in watch mode:

```bash
npm run test
```

Run coverage:

```bash
npm run test:coverage
```

Run the full repository check:

```bash
npm run check
```

Run the compiled API real-media integration suite:

```bash
npm run test:integration:media
```

This command builds the packages, API, and web app first, then starts the compiled API on isolated local ports with
temporary `STORAGE_ROOT` directories. It requires `ffmpeg` and `ffprobe` on `PATH`.

Run the browser E2E suite:

```bash
npx playwright install chromium
npm run test:e2e
```

This command builds the repository, starts the compiled API on `127.0.0.1:4100`, serves the production web build on
`127.0.0.1:4174`, and runs Playwright Chromium tests. The suite uses route-mocked app flows for deterministic UI,
keyboard, console, failed-request, and axe accessibility coverage, plus one narrow `@real-stack` smoke test that uploads
and encodes a generated tiny video through the compiled API.

Useful browser-test variants:

```bash
npm run test:e2e:real
npm run test:e2e:headed
npm run test:e2e:ui
npm run test:e2e:report
```

Playwright artifacts are written to `test-results/` and `playwright-report/` and are intentionally ignored by Git.

## Current Test Scope

The initial unit tests cover pure behavior extracted from the current API and web entry files:

- Shared runtime contract schemas for public API/browser data
- API configuration parsing
- API route composition through `createApp`
- Supertest route tests without binding a TCP port
- Config security tests for loopback defaults, explicit LAN opt-in, exact CORS origin parsing, and JSON body limits
- API-private route-schema tests for safe IDs, strict objects, UTF-8 byte limits, control characters, path separators,
  prototype-like fields, and limited validation details
- HTTP validation tests for every mutable JSON route, including optimization, sample, poster, rename, history delete,
  captions, subtitle muxing, package creation, and YouTube URL import
- CORS allowlist tests for default local origins, requests with no Origin header, valid preflight, and denied origins
- Error-leakage tests for invalid JSON, oversized JSON, unsupported media types, unknown API routes, and generic
  internal-error responses
- Malicious-boundary tests for traversal-like IDs, percent-decoded traversal, NUL/control characters, prototype-shaped
  JSON, and YouTube suffix/path-domain attacks
- API response schema compatibility with shared contracts
- Privacy assertions that public JSON does not expose storage paths, output paths, sidecar paths, or source hashes
- Pure video-core settings normalization, FFmpeg argument-array construction, FFprobe normalization, compatibility
  analysis, filename sanitization, caption utilities, and output-size estimation
- Filename sanitization
- FFprobe frame-rate and number parsing
- Web compatibility warning generation
- Default optimization-setting normalization
- FFmpeg argument construction
- Caption timestamp parsing and formatting
- WebVTT to SRT conversion
- Subtitle timing shifting
- Output-size estimation
- Web export recommendation logic
- Frontend codec/container compatibility normalization
- In-memory video and job repository contracts, including replacement, deletion, lookup, instance isolation, and fresh
  arrays from collection reads
- File-backed manifest-store behavior using temporary directories, including missing manifests, formatted JSON,
  malformed-manifest warnings, path isolation, and preservation of private persisted fields
- Runtime isolation with injected repositories and manifest stores, including isolated videos, jobs, directory
  configuration, manifest restoration, and DTO privacy
- Process infrastructure tests for the Node process-runner adapter and deterministic fake process handles
- Tool-adapter tests for FFprobe invocation, FFmpeg capability parsing, whisper.cpp command resolution, and yt-dlp
  command resolution/import arguments
- Application service tests for manifest persistence policy, cleanup cascades, capability aggregation, upload storage,
  duplicate detection, metadata probing, rename behavior, and download/delete descriptors
- Job-service tests for job creation, reuse behavior, sample/poster clamping, exact pair settings, rename, cancellation,
  descriptors, persistence, and fake execution delegation
- Job-execution tests for fake FFmpeg process startup, progress parsing, stderr handling, completion, sample estimates,
  spawn errors, nonzero exits, canceled closes, poster arguments, mux arguments, registry cleanup, and artifact cleanup
- Caption-service tests for subtitle validation, job naming, missing Whisper configuration, leading-silence parsing,
  caption retrieval/editing, SRT generation, mux validation, and fake execution delegation
- Package-service tests for package validation, selected output reading, generated archive entry names, transcript
  creation, caption-noise removal, package job completion fields, output size, persistence, and DTO privacy
- Package helper tests for API-private ZIP, HTML, JSON, duration, transcript, and caption-cleaning helpers
- Scheduler unit tests for the runtime-scoped FIFO media queue using deferred promises rather than timers or polling
- Lifecycle tests for valid and invalid job-status transitions, progress bounds, completion/failure/cancellation
  timestamps, and protection from late terminal process events
- Service scheduling tests proving encode, sample, poster, subtitle, and mux jobs consume media slots while package jobs
  remain outside the media scheduler
- Fake-process concurrency tests proving only the configured number of FFmpeg/Whisper workflows start, queued work waits,
  cancellation prevents queued callbacks, and slots are released after success, failure, spawn error, and cancellation
- Serialized persistence tests using deferred fake manifest writes to prove save requests run in order, `flush()` waits
  for requested writes, failed saves surface to callers, later saves still work, and explicitly scheduled saves do not
  create unhandled rejections
- Atomic manifest-store tests using temporary directories to prove explicit missing/loaded results, pretty JSON,
  last-known-good backup creation, backup recovery for corrupt or missing primaries, invalid-structure rejection, and
  fail-safe startup behavior when both primary and backup are corrupt
- Restart recovery tests for hash recalculation, interrupted queued/running jobs becoming canceled history, missing
  completed outputs becoming failed history, dangling job skipping, and partial-artifact cleanup
- Scheduler shutdown tests for stopping acceptance, rejecting late enqueues, canceling queued callbacks, and resolving
  multiple idle waiters
- Runtime shutdown tests for idempotent shutdown, queued/running cancellation, media process termination, final manifest
  persistence, and video preservation
- Server lifecycle tests with fake server/process objects, covering signal-triggered shutdown, duplicate-signal
  coalescing, idle/all connection close hooks, runtime shutdown awaiting, and failure exit-code reporting without
  binding real ports

Fast unit tests intentionally avoid spawning FFmpeg, FFprobe, whisper.cpp, or yt-dlp. FFmpeg argument tests assert exact
argument arrays only; they do not execute FFmpeg. The separate real-media integration suite does execute FFmpeg and
FFprobe through the compiled API.

Fast process-backed unit tests use `apps/api/src/infrastructure/processes/test/fake-process-runner.ts`. The fake captures
command names, argument arrays, spawn options, stdout/stderr chunks, close events, error events, `kill`, and `unref`
without launching real programs. Service tests should use temporary directories for filesystem behavior and fakes for
tool/process boundaries unless they are explicitly marked as real-media integration tests.

Scheduler tests are intentionally separate from real FFmpeg verification. Unit tests use deferred promises to control
queue order deterministically. Fake-process tests verify repository state, process registry behavior, and lifecycle
settlement without launching external tools. Real-media smoke tests should use generated fixtures and
`MAX_CONCURRENT_MEDIA_JOBS=1` to prove an actual second encode remains queued until the first process finishes.

Archive tests use a small test-only ZIP entry-name reader to verify generated package structure without adding a
production ZIP dependency. Caption and execution tests use fake process sequences; real Whisper/FFmpeg behavior remains
manual smoke-test coverage unless an integration test is added explicitly.

API route tests use Supertest directly against `createApp(fakeRuntime)`. They exercise HTTP extraction, status codes,
SSE/download-adjacent response behavior where practical, shared-schema parsing, and privacy assertions without opening
a network port or initializing production storage. The fake runtime is intentionally small and deterministic; it is not
a production service abstraction.

Manifest tests intentionally separate persistence mechanics from persistence policy. The file store owns explicit
primary/backup load results, validation, atomic same-directory replacement, and backup recovery. Runtime and persistence
service tests cover policy such as startup normalization, restoring only eligible records, flushing before
initialization resolves, and keeping public DTOs free of private paths and hashes.

Real-media graceful-shutdown and crash-recovery integration tests use isolated `STORAGE_ROOT` directories. They verify
that manifests parse immediately, interrupted jobs are retained as canceled history, no queued job resumes, source
videos remain, and partial outputs are removed. On Windows, child-process signal termination is treated as restart
recovery; on POSIX CI, `SIGTERM` exercises the graceful shutdown path.

The real-media integration suite currently covers:

- Production health and capability routes through the compiled server
- Multipart upload, duplicate detection, metadata inspection, and rename
- MP4 H.264 encode, download, FFprobe validation, and byte-range output streaming
- WebM VP9 encode and suffix byte-range streaming for browser playback regression coverage
- Poster generation as WebP
- Website package ZIP creation and privacy checks
- Media-process timeout containment, partial-output cleanup, and later work acceptance
- API restart recovery for running and queued jobs

The real-media integration suite is expected to remain compatible with the safer defaults by explicitly using loopback
host settings in the compiled API harness. Most request-validation coverage belongs in fast Supertest route tests rather
than real-media scenarios.

Phase 6B upload and storage hardening adds focused fast coverage for:

- Multer 2 route-scoped upload parsing, including valid file handling through `POST /api/videos`, missing file behavior,
  wrong or unexpected fields, multiple files, extra text fields, oversized files, malformed multipart requests, and
  parser-error cleanup of staged candidates.
- Filename admission for normal browser filenames plus traversal, Windows drive-qualified paths, UNC paths, path
  separators, `.`/`..`, control characters, CR/LF, NUL, whitespace-only values, and UTF-8 byte limits.
- Bounded content-signature inspection for supported container families and rejection of unknown or spoofed content such
  as text, HTML, PDF, ZIP, executable, image, and truncated signatures. Signature tests prove extension and MIME claims
  are not trusted; FFprobe remains authoritative for real media validation.
- Media admission for valid staged video, duplicate cleanup, unsupported bytes, empty and oversized files, audio-only or
  attached-picture-only probe results, invalid dimensions/duration, probe failure, move/persistence rollback, and URL
  imports reusing the same admission path.
- Storage-boundary behavior for lexical containment, sibling-prefix escapes, external paths, existing regular files,
  directory rejection, symlink rejection, safe moves/removals, pruning with contained keep paths, pruning aborts, and
  missing contained keep paths during restart recovery.
- Manifest-integrity behavior for valid contained paths, missing contained paths, external path rejection, symlink path
  rejection, no pruning after integrity failure, no manifest rewrite after integrity failure, and preservation of
  external sentinel files.
- Streaming behavior for full responses, prefix/suffix ranges, `416`, inline/attachment descriptors, missing files,
  external/symlink rejection through storage descriptors, handle closure on success, abort, and stream error, and no
  double close.

The real symlink storage-boundary unit test is platform-conditional:

- On Ubuntu CI, `it.runIf(process.platform !== "win32")` executes the real symlink-backed file rejection test.
- On Windows developer shells, the real symlink case is skipped because unprivileged symlink creation is not reliably
  available. Deterministic lexical, external-path, missing-file, pruning, and manifest-integrity tests still run on
  Windows.
- Security requirements are not represented only by the skipped test; non-symlink containment and manifest safety checks
  run cross-platform.

## Not Covered Yet

- Subtitle generation through whisper.cpp
- YouTube importing through yt-dlp
- Live-network YouTube importing through yt-dlp
- Full browser visual-regression screenshot comparison

## Phase 7A Frontend Tests

The web workspace now runs Vitest in `jsdom` with React Testing Library and `@testing-library/jest-dom`.

Coverage includes:

- API-client consumer-contract tests for frontend-used request families.
- `/api/videos/:id/pair` compatibility coverage that verifies POST, JSON content type, and the current settings body.
- Centralized structured and plain-text API error parsing.
- Fake job-event tests for EventSource URL construction, running updates, terminal cleanup, invalid payloads, errors,
  manual close, and duplicate subscription replacement.
- Pure selector/presenter tests for current-video jobs, package candidates, output presence, savings, formatting,
  subtitle cleanup, and embed markup.
- Behavioral React tests for initial load, upload success/failure, Optimize For Website pair requests, job-event updates,
  and poster lightbox controls.

`jsdom` does not validate real codec playback, responsive layout, browser CORS behavior, or actual media seeking. Those
remain required manual browser smoke checks for Phase 7A.

## Phase 7A Frontend Test Coverage

Frontend tests now include API-client consumer-contract tests, job-event adapter tests, selector/formatter tests, feature component tests, the synchronized-playback hook tests, the poster-lightbox test, and a smaller root App integration suite.

The API-client tests verify request methods, JSON bodies, multipart upload behavior, structured/plain-text error handling, and the `/api/videos/:id/pair` contract with the current optimization settings body. Job-event tests verify update forwarding, terminal cleanup, invalid payload handling, error cleanup, and duplicate subscription replacement.

Feature tests exercise upload/file-selection behavior, current-job progress/cancellation rendering, poster lightbox controls, and media synchronization behavior without requiring real media decoding. jsdom does not decode video/audio, so production-browser smoke testing is still required for playback, drag-and-drop feel, lightbox gestures, captions preview, and browser console validation.

Real-media integration remains an API-level regression suite and should be run twice consecutively for Phase 7A review because recent phases exposed timing-sensitive shutdown/recovery behavior.

## Phase 7B Browser E2E And Accessibility

Phase 7B adds Playwright browser coverage with a console and failed-request gate. Tests fail on unexpected browser
`pageerror`, console errors, or failed requests, while allowing normal browser-aborted media/download requests.

Coverage includes:

- Empty app shell load, navigation, theme toggle, narrow viewport overflow guard, and axe scan.
- Poster lightbox keyboard focus, Tab trapping, Escape close, focus restoration, and axe scan.
- Mocked upload, Optimize For Website, current settings payload verification, job-event subscription, completed outputs,
  poster preview, and download behavior.
- Mocked custom-export validation failure presentation without unhandled browser errors.
- History restoration, caption editing, package creation, bulk delete request wiring, and representative axe scan.
- A compiled-stack smoke test using generated real media for upload, metadata inspection, H.264 export, source/output
  download, and cleanup.

The mocked tests intentionally do not decode real media. The `@real-stack` test verifies the browser can drive the
compiled API, but it remains narrow so CI stays fast and deterministic. Manual smoke testing is still useful for long
videos, real subtitle generation through whisper.cpp, and real YouTube imports through yt-dlp.

## Phase 8A Storage Capacity Tests

Phase 8A adds fast tests for the new capacity boundary:

- Configuration defaults and validation for the minimum free-space reserve, optional managed quota, stale-temp age, and
  housekeeping interval.
- Capacity-provider bigint conversion, safe integer rejection, and disk-full error recognition.
- Managed-storage inventory across uploads, outputs, temp, and upload-staging, including stale temporary detection and
  no-follow symlink behavior where the platform permits symlink creation.
- Storage policy pressure states, quota and free-space rejection, runtime reservation accounting, and manual stale-temp
  cleanup results.
- Reservation-manager idempotent release and runtime shutdown clearing.
- Pure allocation estimates for encode, sample, poster, subtitle, mux, package, URL import, and sparse metadata.
- Upload middleware dynamic capacity admission, reservation release, configured `413` versus capacity `507`, and staging
  cleanup on failure.
- Housekeeping startup run, periodic run, no-overlap behavior, timer cleanup, and shutdown settling.

Frontend tests cover storage-status loading, warning/critical copy, known and unknown capacity values, configured quota,
temporary-cleanup success and failure, disabled cleanup state after cleanup, job-admission `507` presentation, and
absence of private path text in the browser.

Playwright route-mocked coverage includes the storage panel, critical state, keyboard-triggered temporary cleanup,
reclaimed-space feedback, an axe scan, a narrow viewport overflow guard, and the shared console/failed-request gate. The
real-stack browser smoke checks that storage status appears during an actual upload/encode/delete flow and exercises the
cleanup control when stale temporary data exists.

The compiled real-media integration suite now calls the storage status and manual cleanup APIs during the basic media
workflow and uses an intentionally huge configured reserve to prove low-capacity upload rejection returns `507` without
filling the developer or CI disk.
