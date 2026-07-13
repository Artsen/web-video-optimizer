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

## Current Test Scope

The initial unit tests cover pure behavior extracted from the current API and web entry files:

- Shared runtime contract schemas for public API/browser data
- API configuration parsing
- API route composition through `createApp`
- Supertest route tests without binding a TCP port
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

The tests intentionally avoid spawning FFmpeg, FFprobe, whisper.cpp, or yt-dlp. FFmpeg argument tests assert exact
argument arrays only; they do not execute FFmpeg. Those tools are still required for the running application and for
future real-media integration tests.

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

Manifest tests intentionally separate persistence mechanics from persistence policy. The file store owns loading and
writing the current JSON shape. Runtime tests cover policy such as startup normalization, restoring only eligible
records, and keeping public DTOs free of private paths and hashes.

## Not Covered Yet

- Full production-runtime route integration
- Real multipart upload storage through the production HTTP server
- Real FFmpeg process execution
- Automated real-media queue smoke tests
- Browser rendering behavior
- End-to-end package ZIP validation with real media
- Subtitle generation through whisper.cpp
- YouTube importing through yt-dlp
