# Architecture

## Overview

The app has two local services:

- `apps/web`: React + TypeScript UI served by Vite.
- `apps/api`: Express API that receives uploads, runs FFprobe/FFmpeg, and streams local files.
- `packages/contracts`: shared Zod schemas and inferred TypeScript types for public API/browser data.
- `packages/video-core`: pure media-domain calculations and transformations shared by current and future adapters.

Docker Compose runs both services and installs FFmpeg in the API image.

## Shared Contracts

`packages/contracts` owns public cross-application schemas and types for video metadata, optimization settings, jobs,
history, capabilities, and website package metadata. These contracts describe the data passed between the API and the
browser and are intended to be reused by future CLI and MCP adapters.

The contracts package does not contain business execution logic, React components, Express route handlers, filesystem
paths, child-process behavior, FFmpeg command execution, or persistence code. API-private entities remain in `apps/api`,
including stored upload paths, output paths, sidecar paths, process handles, storage configuration, raw FFprobe
structures, and Express/Multer objects. Browser-only UI types remain in `apps/web`, including component props, modal
state, tab/view state, presentation metadata, and React nodes.

The contracts package defines public data shapes only; reusable media behavior belongs in `packages/video-core`.

## Video Core

`packages/video-core` owns deterministic media-domain behavior such as optimization-setting normalization, FFmpeg
argument-array construction, FFprobe result normalization, browser-oriented compatibility analysis, filename
sanitization, caption timestamp/VTT utilities, and output-size estimation. It consumes shared DTO and settings types
from `packages/contracts` and has no dependency on React, Express, filesystem access, child processes, or environment
configuration.

The API remains responsible for HTTP routes, byte-range delivery, process execution, FFmpeg/FFprobe/Whisper/yt-dlp
invocation, storage, job state, manifests, ZIP creation, and persistence. The web app remains responsible for React
components, presentation wording, form-state behavior, recommendations, and browser UI state. Future CLI and MCP
adapters should consume `packages/contracts` and `packages/video-core` rather than copying media-domain logic.

## API Composition

`apps/api/src/app.ts` exports `createApp(dependencies)`, the HTTP composition root used by tests and production. It
registers middleware, route modules, and error handling, but it does not listen on a port, create storage directories,
load manifests, or spawn media tools.

`apps/api/src/server.ts` is the production startup adapter. It parses environment configuration, creates the production
runtime, initializes storage and manifests, constructs the upload middleware, creates the Express app, and calls
`listen`.

Route modules in `apps/api/src/routes` are HTTP adapters. They extract request params, request bodies, multipart files,
status codes, response headers, SSE mechanics, downloads, and byte-range streaming. They depend on the temporary
coarse `ApiRuntime` boundary rather than global maps or production storage details.

`apps/api/src/runtime/production-runtime.ts` is the production composition root and `ApiRuntime` facade. It constructs
runtime-scoped repositories, the file manifest store, process infrastructure, tool adapters, and focused application
services, then delegates route-facing operations through the stable `ApiRuntime` interface.

Internal API entities live under `apps/api/src/entities`. They contain storage paths, output paths, sidecar paths, and
source hashes needed for local persistence and recovery. Public JSON responses are still constructed through explicit
DTO mappers in `apps/api/src/dto`, so private implementation fields do not leak into browser responses.

Repository instances are created per production runtime. They are not global singletons, which allows independently
created runtimes to keep video state, job state, directory configuration, and manifest restoration isolated.

Process creation is behind `ProcessRunner`, with the Node implementation isolated in
`apps/api/src/infrastructure/processes/node-process-runner.ts`. Running job processes are tracked through a
runtime-scoped `ProcessRegistry`. Tool-specific behavior is behind infrastructure adapters for FFprobe, FFmpeg encoder
capability detection, whisper.cpp resolution, yt-dlp importing, and desktop file reveal behavior.

Process-backed media jobs are admitted through a runtime-scoped bounded FIFO scheduler. `MAX_CONCURRENT_MEDIA_JOBS`
controls the number of concurrent media slots and defaults to `1`, because local video encoding is CPU-intensive.
Encode, sample, poster, subtitle generation, and subtitle mux jobs consume scheduler slots. Website package jobs remain
outside the media scheduler because package creation reads completed files and assembles a ZIP without spawning FFmpeg,
Whisper, or another media process. During runtime shutdown, the scheduler stops accepting new work, drops queued
callbacks, and can wait for running tasks to settle.

Job lifecycle transitions are explicit API-private behavior. Valid transitions are `queued -> running`,
`queued -> canceled`, `queued -> failed`, `running -> completed`, `running -> failed`, and `running -> canceled`.
Terminal jobs cannot be rewritten by late process events. The scheduler controls capacity only; services and lifecycle
helpers own repository state, progress, cancellation, artifact cleanup, and persistence calls.

Application services own API-private workflows:

- `StatePersistenceService`: serialized manifest save requests, flush boundaries, manifest load/recovery policy, and
  restart cancellation normalization.
- `CleanupService`: queued-task cancellation, job artifact deletion, active-process termination, video deletion cascades,
  and orphan pruning.
- `VideoService`: upload/import storage, content hashing, duplicate detection, metadata probing, rename, source
  descriptors, downloads, and video deletion delegation.
- `JobService`: job lookup, optimization/sample/poster/pair creation, reuse policy, descriptors, rename, cancellation,
  deletion, scheduler enqueueing, reveal delegation, and public job DTO mapping.
- `JobExecutionService`: FFmpeg-backed encode, sample, poster, and subtitle-mux process lifecycles, progress parsing,
  stderr message updates, output-size capture, sample estimates, registry cleanup, artifact cleanup on failure, and
  promise settlement for scheduler slot release.
- `CaptionService`: subtitle-job validation/reuse/creation, leading-silence detection, audio extraction, whisper.cpp
  transcription, VTT/SRT handling, caption editing, subtitle scheduler enqueueing, and subtitle-mux
  validation/delegation.
- `PackageService`: website-package request interpretation, selected-output reading, generated HTML/README/transcript
  creation, ZIP assembly, package-job completion, and public result mapping.
- `CapabilitiesService`: combines FFmpeg, whisper.cpp, and yt-dlp capability reporting.
- Packaging helpers remain API-private under `apps/api/src/services/helpers`.

The production runtime constructs this graph and returns an `ApiRuntime` facade:

```text
routes
  ->
ApiRuntime
  ->
production-runtime composition
  |-- CapabilitiesService
  |-- VideoService
  |-- JobService
  |-- JobExecutionService
  |-- CaptionService
  |-- PackageService
  |-- CleanupService
  |-- JobScheduler
  `-- StatePersistenceService
      ->
repositories, manifest store, process/tool infrastructure
```

Routes continue to depend only on `ApiRuntime` and route-safe DTO types. Future CLI and MCP adapters should call the
same application services, or a facade over them, rather than duplicating media workflow logic.

## Persistence And Recovery

The manifest storage shape remains:

```json
{
  "videos": [],
  "jobs": []
}
```

The primary manifest is written with serialized save requests. Each write is staged to a unique temporary file in the
same directory, flushed, then atomically renamed over the primary manifest. Before replacement, the previous valid
primary is preserved as `manifest.json.bak`. A corrupt primary is never treated as empty state: startup recovers from a
valid backup when possible, and fails clearly when neither primary nor backup can be validated.

Manifest validation is API-private. It validates the top-level object, `videos` and `jobs` arrays, public nested DTO
fields, and private restoration fields such as `storedPath`, `sourceHash`, `outputPath`, and `sidecarPath`.

Queued and running jobs are persisted as their actual in-memory statuses. On API restart, restored queued or running
jobs are normalized to canceled history with `Canceled by API restart`, progress reset to `0`, and partial output,
sidecar, and job-specific temporary artifacts removed. Completed jobs whose required output is missing are restored as
failed with `Output missing during API restart recovery`. Jobs referencing missing videos are skipped.

Initialization creates directories, validates and restores the manifest, normalizes interrupted state, merges duplicate
videos, prunes true orphan files, saves the normalized manifest, and flushes persistence before resolving. Orphan pruning
does not run after unrecoverable manifest corruption.

## Graceful Shutdown

The production runtime exposes an API-private `shutdown()` operation. Routes do not expose shutdown controls. Shutdown
stops scheduler acceptance, cancels queued callbacks, marks queued/running jobs as canceled with `Canceled by API
shutdown`, terminates registered media processes with `SIGTERM`, waits up to `SHUTDOWN_GRACE_PERIOD_MS`, then sends
`SIGKILL` where supported for remaining processes. Final state is saved and flushed before shutdown resolves.

`apps/api/src/server-lifecycle.ts` retains the HTTP server handle and installs one shared `SIGINT`/`SIGTERM` shutdown
path. The server stops accepting new connections, closes idle connections where Node supports it, waits for runtime
shutdown, and reports shutdown failures with a nonzero exit code.

Remaining Phase 5C work includes process-output limits, normal execution timeouts, retry/resume policy, stronger
process containment, and automated real-media integration coverage.

Public JSON responses are now constructed through explicit DTO mappers in `apps/api/src/dto`. Contracts remain the
public response authority. Private implementation fields such as absolute filesystem paths, source hashes, output
paths, and sidecar paths are no longer part of public JSON responses.

## Data Flow

1. The user drops a video into the browser.
2. The web app uploads it to `POST /api/videos`.
3. The API stores the file under the local storage root and runs FFprobe.
4. The API returns normalized metadata plus compatibility warnings.
5. The user chooses optimization settings.
6. The web app starts an encoding job with `POST /api/videos/:id/jobs`.
7. The route layer delegates job creation to `ApiRuntime`.
8. The API enqueues process-backed media work through the bounded scheduler.
9. When a media slot is available, the API starts FFmpeg/Whisper through the process-runner boundary and updates
   repository-backed job state through explicit lifecycle transitions.
10. The web app listens to `GET /api/jobs/:id/events` and polls job state as a fallback.
11. The final output is streamed from `GET /api/jobs/:id/download`.

## Storage

The API uses a local storage root with these subdirectories:

- `uploads`: original uploaded files
- `outputs`: optimized files
- `tmp`: scratch space for future sample encodes

The Docker setup stores this under a named Docker volume called `video_data`.

## Security And Privacy

The app is intended for trusted local use. It avoids cloud APIs and remote processing. The backend sanitizes generated filenames and never executes shell strings; FFmpeg is invoked with argument arrays.

For a production-grade local release, add file size limits, stronger content validation, automatic retention cleanup, and optional authentication for LAN exposure.
