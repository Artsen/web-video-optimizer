# Local Web Video Optimizer

A local-first browser app for inspecting, compressing, converting, and comparing website videos with FFmpeg.

Videos stay on your machine. The app runs a local React UI and local API, stores uploads temporarily, and uses FFprobe/FFmpeg for analysis and processing.

## MVP Features

- Drag-and-drop video upload
- Polished desktop-style workspace with a compact Library rail, a combined Prepare/Results source workspace, and focused Custom, Captions, and Compare views
- One-click `Optimize For Website` path for MP4/H.264 fallback, WebM/AV1 modern source, and WebP poster generation
- Source preview immediately after upload
- FFprobe-based technical inspection
- Web compatibility warnings
- MP4/H.264/AAC export path
- WebM/AV1/VP9 export options for modern browsers
- Resolution resizing
- CRF quality control
- AV1/VP9 encoder speed controls
- Audio removal or audio bitrate adjustment
- Audio codec, sample rate, and channel controls
- MP4 fast-start support
- Tooltips for video optimization settings
- Expert Mode for advanced codec, CRF, resize, audio, and encoder controls
- Web delivery recommendations for size, codecs, frame rate, and fallback strategy
- Copyable starter HTML markup for the finished export
- Sample encode estimation for CRF workflows
- WebP poster image generation
- One-click modern + fallback export jobs
- Downloadable web package with exported videos, poster, `embed.html`, and `README.txt`
- Source-attached variation list with file sizes, savings, badges, and package selection
- Inline Results section attached to the active source, with compact source summary, output cards, package readiness, and ZIP creation
- Target size shortcuts for roughly 2 MB, 5 MB, and 10 MB web budgets
- Local output reveal buttons for opening generated files in the system file manager
- Failed and canceled job cards with command-copy support for troubleshooting
- Subtitle detection, local subtitle generation with whisper.cpp, preview/editing, and VTT/SRT downloads
- Optional remuxing to embed generated subtitle tracks into MP4/WebM outputs
- Job cancellation
- Persistent history manifest with individual and bulk cleanup
- Storage status, low-space warnings, capacity-aware uploads/jobs, and safe temporary cleanup
- FFmpeg encoder capability checks
- Estimated output size
- Local FFmpeg processing
- Side-by-side original/optimized comparison
- Optimized file download
- Copyable FFmpeg command
- Dockerized local setup

## Quick Start With Docker

Prerequisites:

- Docker Desktop

Run:

```bash
docker compose up --build
```

Open:

- Web app: http://localhost:5173
- API health check: http://localhost:4000/health

The API container includes FFmpeg and FFprobe.

## Local Development Without Docker

Prerequisites:

- Node.js 20+
- npm
- FFmpeg and FFprobe on your PATH

Install dependencies:

```bash
npm install
```

Run the API:

```bash
npm run dev:api
```

By default, the API binds only to `127.0.0.1` and allows browser requests only from
`http://localhost:5173` and `http://127.0.0.1:5173`. CORS origins are exact; wildcard origins are not enabled.

By default, the API runs one process-backed media job at a time. This keeps local CPU usage predictable for encodes,
poster generation, subtitle generation, and muxing. To allow more concurrent media jobs, set:

```powershell
$env:MAX_CONCURRENT_MEDIA_JOBS="2"
npm.cmd run dev:api
```

Graceful shutdown uses a separate timeout while the API cancels queued/running media work, terminates active processes,
and flushes the manifest:

```powershell
$env:SHUTDOWN_GRACE_PERIOD_MS="15000"
```

This does not limit normal encode, subtitle, import, or package duration. It only bounds application shutdown.

Normal media and tool processes have their own safety limits:

```powershell
$env:MEDIA_PROCESS_TIMEOUT_MS="1800000"
$env:TOOL_COMMAND_TIMEOUT_MS="60000"
$env:PROCESS_KILL_GRACE_PERIOD_MS="5000"
$env:MAX_CAPTURED_PROCESS_OUTPUT_BYTES="4194304"
```

`MEDIA_PROCESS_TIMEOUT_MS` applies to FFmpeg, whisper.cpp, and yt-dlp media workflows. `TOOL_COMMAND_TIMEOUT_MS`
applies to short capability/probe commands.

Run the web app in another terminal:

```bash
npm run dev:web
```

For access from another computer on your local network, explicitly opt in before starting the API:

```powershell
$env:ALLOW_LAN_ACCESS="true"
$env:HOST="0.0.0.0"
$env:CORS_ORIGIN="http://192.168.1.25:5173"
npm.cmd run dev:api
```

Then open the web app with the host machine's LAN IP, for example:

```text
http://192.168.1.25:5173
```

The frontend automatically calls the API at the same LAN host on port `4000`, for example `http://192.168.1.25:4000`.
LAN mode assumes a trusted private network and does not add authentication. If Windows prompts for firewall access,
allow Node.js for private networks.

JSON request bodies default to a 5 MiB limit:

```powershell
$env:JSON_BODY_LIMIT_BYTES="5242880"
```

This limit applies to JSON settings, captions, and package metadata requests. Video upload size limits are separate and
remain controlled by the upload middleware.

Video uploads default to a separate 2 GiB limit:

```powershell
$env:UPLOAD_FILE_SIZE_LIMIT_BYTES="2147483648"
```

The upload limit accepts positive integer byte values only. It is separate from `JSON_BODY_LIMIT_BYTES` and
`MAX_CAPTURED_PROCESS_OUTPUT_BYTES`.

The API also keeps a configurable free-space reserve before admitting uploads, processing jobs, imports, or website
package creation:

```powershell
$env:MIN_FREE_STORAGE_BYTES="536870912"
$env:MAX_MANAGED_STORAGE_BYTES="0"
$env:TEMP_FILE_MAX_AGE_MS="86400000"
$env:HOUSEKEEPING_INTERVAL_MS="3600000"
```

`MIN_FREE_STORAGE_BYTES` is the amount of filesystem space the app tries to leave untouched. `MAX_MANAGED_STORAGE_BYTES`
is optional; `0` means no app-managed quota. `TEMP_FILE_MAX_AGE_MS` controls stale temporary and upload-staging cleanup,
and `HOUSEKEEPING_INTERVAL_MS` controls the background cleanup cadence. Durable source videos and completed exports are
not automatically deleted; use the Library/history controls when you want to remove them.

Upload failures distinguish the configured maximum file size from current disk pressure. A file over
`UPLOAD_FILE_SIZE_LIMIT_BYTES` returns `413 UPLOAD_TOO_LARGE`. A request the machine cannot safely store right now
returns `507 INSUFFICIENT_STORAGE`.

## Upload Admission And Storage Safety

The API uses Multer 2 with route-scoped disk staging for `POST /api/videos`. Browser upload behavior is unchanged: the
multipart field name remains `video`, file-picker and drag-and-drop uploads still send a normal multipart request, and
valid MP4/WebM-style media still appears in the app after analysis.

Uploaded bytes first land in `<STORAGE_ROOT>/tmp/upload-staging` with an internally generated staging filename. Client
filenames, extensions, and MIME types are treated as untrusted display metadata; they are not used as staging paths and
are not enough to admit media. Admission checks include a safe original filename, bounded content-signature inspection,
and FFprobe validation that the file is genuine temporal video with finite positive dimensions and duration. Audio-only
files, corrupt files, unsupported files, and fake files renamed to `.mp4` are rejected. Valid media can still be accepted
when the browser or client sends it as `application/octet-stream`.

Rejected candidates are removed from staging. Duplicate uploads are cleaned up and reuse the existing source record
rather than creating another permanent file. Accepted sources are moved into the managed `uploads` area with an internal
ID and canonical extension.

Storage paths are contained within managed directories under `STORAGE_ROOT`. The API validates managed roots, rejects
symlink-backed media, and validates persisted source/output/sidecar paths before restoration, streaming, cleanup, or
deletion. Public responses continue to omit filesystem paths, hashes, staging paths, canonical paths, and storage-area
details.

The Library view includes a compact Storage panel with managed bytes, reserved bytes for queued or active work,
available disk space when the platform reports it, the configured quota, uploads/outputs/temp/staging breakdowns, and
reclaimable stale temporary data. Managed bytes are actual inventoried files in app storage; reserved bytes are shown
separately and are still considered by the API when admitting more work. The manual cleanup button removes stale
temporary files only; it does not delete referenced uploads, completed outputs, or history records.

On Windows PowerShell, if script execution blocks `npm`, use `npm.cmd` instead:

```powershell
npm.cmd install
npm.cmd run dev:api
npm.cmd run dev:web
```

Run the fast repository checks:

```bash
npm run check
```

Run the compiled API real-media integration suite:

```bash
npm run test:integration:media
```

The integration suite requires FFmpeg and FFprobe on PATH and uses generated temporary media.

Run browser E2E and accessibility checks:

```bash
npm run test:e2e
```

This builds the app, starts isolated local API/web servers, runs Playwright Chromium tests, checks representative axe
accessibility scans, and includes one small real-stack upload/encode/download smoke test.

Run deterministic UI screenshot review locally:

```bash
npm run review:ui-screens
```

This builds the app, runs a mocked Playwright visual pass, and writes screenshots to `.tmp/ui-review/` for manual
inspection. The screenshots are not a CI gate and are intentionally ignored by Git.

## Repository Structure

```text
apps/
  api/    Express API that stores temporary files and runs FFmpeg/FFprobe
  web/    React + TypeScript frontend
docs/
  architecture.md
```

## API Overview

- `POST /api/videos` uploads and analyzes a video
- `POST /api/videos/url` imports a permitted YouTube video through local `yt-dlp`
- `GET /api/videos/:id/source` streams the uploaded source
- `POST /api/videos/:id/jobs` starts an optimization job
- `POST /api/videos/:id/sample` starts a short sample encode
- `POST /api/videos/:id/poster` generates a poster image
- `POST /api/videos/:id/subtitles` generates WebVTT and SRT captions with whisper.cpp
- `POST /api/videos/:id/pair` starts modern WebM/AV1 and fallback MP4/H.264 jobs
- `POST /api/videos/:id/package` creates a downloadable web package ZIP
- `GET /api/jobs/:id` returns job status
- `GET /api/jobs/:id/events` streams progress events
- `GET /api/jobs/:id/output` streams the optimized output for preview
- `GET /api/jobs/:id/download` downloads the optimized output
- `GET /api/jobs/:id/sidecar` downloads sidecar outputs such as SRT captions
- `GET /api/jobs/:id/captions` reads generated caption text for preview/editing
- `PUT /api/jobs/:id/captions` saves edited WebVTT captions and regenerates SRT
- `POST /api/jobs/:id/mux-subtitles` creates a captioned MP4/WebM by embedding a completed subtitle job
- `POST /api/jobs/:id/reveal` opens the generated file in the local file manager
- `POST /api/jobs/:id/cancel` cancels a running job
- `GET /api/capabilities` reports available FFmpeg encoders
- `GET /api/storage` reports safe local storage status
- `POST /api/storage/cleanup` removes stale temporary files only and returns updated storage status
- `GET /api/history` returns current session files and jobs
- `POST /api/history/delete` deletes selected files/jobs
- `DELETE /api/videos/:id` removes temporary files for a video

Mutable JSON endpoints require `Content-Type: application/json`, reject unknown fields, and return stable JSON error
codes for validation, invalid JSON, oversized JSON, unsupported media types, denied CORS origins, unknown API routes,
and unexpected internal errors. Unknown internal errors are logged server-side and returned to clients as
`Unexpected server error` without filesystem paths or process details.

## Privacy Notes

This project is designed for local use. It does not require accounts, cloud storage, external APIs, or remote video processing. Uploaded files are staged and admitted only inside the local API storage directory or Docker volume until cleaned up. A local `manifest.json` tracks history so files and completed jobs can be restored after the API restarts.

## Optional YouTube Imports

URL imports use a local `yt-dlp` executable and are intended only for videos you own or have permission to download. Install `yt-dlp`, make sure it is on PATH, or start the API with:

```powershell
$env:YT_DLP_BIN="C:\path\to\yt-dlp.exe"
npm.cmd run dev:api
```

The API automatically passes its current Node.js executable to `yt-dlp` as a JavaScript runtime. If `yt-dlp` still warns that no supported JavaScript runtime is available, set it explicitly before starting the API:

```powershell
$env:YT_DLP_JS_RUNTIME="node:C:\Program Files\nodejs\node.exe"
npm.cmd run dev:api
```

The app downloads the video locally, sends the downloaded file through the same admission path as a browser upload,
analyzes it with FFprobe, and then treats it like a normal uploaded file.

Longer videos may take a minute before they appear in the app. If import fails, the error shown in the UI comes from `yt-dlp`; some videos may require browser cookies, sign-in, or may not be downloadable by `yt-dlp`.

## Optional Local Subtitles

Subtitle generation uses `whisper.cpp` when configured. Install or build whisper.cpp, download a model, then start the API with:

```powershell
$env:WHISPER_CPP_BIN="C:\path\to\whisper-cli.exe"
$env:WHISPER_CPP_MODEL="C:\path\to\ggml-base.en.bin"
npm.cmd run dev:api
```

If a video already has embedded subtitle tracks, the app reports them from FFprobe. If no subtitles exist and an audio track is present, the app can generate `.vtt` and `.srt` caption files locally. Completed captions can be edited in the Results view, downloaded as sidecar files, included in the website ZIP, or remuxed into completed MP4/WebM outputs as embedded subtitle tracks.

## Preset Strategy

- `Maximum Compatibility`: MP4, H.264, AAC, yuv420p, fast-start.
- `Silent Background`: small MP4, resized, lower frame rate, no audio.
- `Product / Marketing`: H.264 fallback similar to a hand-written website export command.
- `AV1 Hero MP4`: AV1, resized, 24 fps, no audio, tuned for small silent hero videos.
- `AV1 WebM Small`: AV1 in WebM with Opus audio for modern browsers.

For best website coverage, export at least one MP4/H.264 fallback. The one-click defaults create a 1280px, 24 fps MP4/H.264 fallback and a 1280px, 24 fps WebM/AV1 modern source. Use Custom when you need to preserve source frame rate or change quality targets.

## Web Delivery Notes

- Use MP4/H.264/AAC as the safest fallback for broad browser support.
- Add AV1 or VP9 WebM when smaller modern-browser files justify slower encodes.
- Use `preload="metadata"` unless the video is the primary page content.
- Use a real poster image to improve perceived performance, layout stability, and search/social previews.
- Prefer sidecar WebVTT via `<track>` for normal website embeds; embedded subtitles are useful for file handoff but browser behavior is less consistent.
- Keep silent background videos muted, looped, and audio-free.
- Prefer smaller dimensions and lower frame rates for decorative or hero videos.

## Current Scope

The first implementation targets practical H.264, AV1, and VP9 CRF workflows. Advanced features such as batch processing, visual quality scoring, sample-encode estimation, and browser-only WASM processing are intentionally left for future iterations.

## Frontend Tests

The web workspace uses Vitest with jsdom and React Testing Library for frontend behavior tests:

```powershell
npm.cmd run test:run --workspace apps/web
npm.cmd run test:coverage --workspace apps/web
```

The browser app keeps network calls behind the typed API client and job progress behind the job-event adapter. Manual
browser smoke is still required for real media playback and visual equivalence.

### Frontend Architecture

The browser app uses a small React bootstrap, injected API/event dependencies, feature-level workflow components, centralized API/error/event boundaries, and a CSS design system split across semantic tokens, reset, foundations, layout, component, feature, and responsive layers. Frontend tests cover API contracts, event subscriptions, selectors, feature components, root workflow behavior, browser accessibility, and representative screenshot review states.
