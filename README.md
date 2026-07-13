# Local Web Video Optimizer

A local-first browser app for inspecting, compressing, converting, and comparing website videos with FFmpeg.

Videos stay on your machine. The app runs a local React UI and local API, stores uploads temporarily, and uses FFprobe/FFmpeg for analysis and processing.

## MVP Features

- Drag-and-drop video upload
- ChatGPT-style workspace with a left Library sidebar and focused Prepare, Jobs & Outputs, and Custom views
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
- Jobs & Outputs center with running job progress, output cards, package readiness, and ZIP creation
- Target size shortcuts for roughly 2 MB, 5 MB, and 10 MB web budgets
- Local output reveal buttons for opening generated files in the system file manager
- Failed and canceled job cards with command-copy support for troubleshooting
- Subtitle detection, local subtitle generation with whisper.cpp, preview/editing, and VTT/SRT downloads
- Optional remuxing to embed generated subtitle tracks into MP4/WebM outputs
- Job cancellation
- Persistent history manifest with individual and bulk cleanup
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

By default, the API runs one process-backed media job at a time. This keeps local CPU usage predictable for encodes,
poster generation, subtitle generation, and muxing. To allow more concurrent media jobs, set:

```powershell
$env:MAX_CONCURRENT_MEDIA_JOBS="2"
npm.cmd run dev:api
```

Run the web app in another terminal:

```bash
npm run dev:web
```

For access from another computer on your local network, open the web app with the host machine's LAN IP, for example:

```text
http://192.168.1.25:5173
```

The frontend automatically calls the API at the same LAN host on port `4000`, for example `http://192.168.1.25:4000`. If Windows prompts for firewall access, allow Node.js for private networks.

On Windows PowerShell, if script execution blocks `npm`, use `npm.cmd` instead:

```powershell
npm.cmd install
npm.cmd run dev:api
npm.cmd run dev:web
```

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
- `GET /api/history` returns current session files and jobs
- `POST /api/history/delete` deletes selected files/jobs
- `DELETE /api/videos/:id` removes temporary files for a video

## Privacy Notes

This project is designed for local use. It does not require accounts, cloud storage, external APIs, or remote video processing. Uploaded files are stored only in the local API storage directory or Docker volume until cleaned up. A local `manifest.json` tracks history so files and completed jobs can be restored after the API restarts.

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

The app downloads the video locally, analyzes it with FFprobe, and then treats it like a normal uploaded file.

Longer videos may take a minute before they appear in the app. If import fails, the error shown in the UI comes from `yt-dlp`; some videos may require browser cookies, sign-in, or may not be downloadable by `yt-dlp`.

## Optional Local Subtitles

Subtitle generation uses `whisper.cpp` when configured. Install or build whisper.cpp, download a model, then start the API with:

```powershell
$env:WHISPER_CPP_BIN="C:\path\to\whisper-cli.exe"
$env:WHISPER_CPP_MODEL="C:\path\to\ggml-base.en.bin"
npm.cmd run dev:api
```

If a video already has embedded subtitle tracks, the app reports them from FFprobe. If no subtitles exist and an audio track is present, the app can generate `.vtt` and `.srt` caption files locally. Completed captions can be edited in the Jobs & Outputs view, downloaded as sidecar files, included in the website ZIP, or remuxed into completed MP4/WebM outputs as embedded subtitle tracks.

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
