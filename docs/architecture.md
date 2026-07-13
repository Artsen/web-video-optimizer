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

Current compatibility note: some API responses still spread internal job or video entities directly, which can expose
private implementation fields such as absolute filesystem paths. Phase 2A documents that behavior and preserves the
existing wire shape; a later API hardening phase should introduce explicit DTO mapping before changing responses.

## Data Flow

1. The user drops a video into the browser.
2. The web app uploads it to `POST /api/videos`.
3. The API stores the file under the local storage root and runs FFprobe.
4. The API returns normalized metadata plus compatibility warnings.
5. The user chooses optimization settings.
6. The web app starts an encoding job with `POST /api/videos/:id/jobs`.
7. The API runs FFmpeg locally and updates in-memory job state.
8. The web app listens to `GET /api/jobs/:id/events` and polls job state as a fallback.
9. The final output is streamed from `GET /api/jobs/:id/download`.

## Storage

The API uses a local storage root with these subdirectories:

- `uploads`: original uploaded files
- `outputs`: optimized files
- `tmp`: scratch space for future sample encodes

The Docker setup stores this under a named Docker volume called `video_data`.

## Security And Privacy

The app is intended for trusted local use. It avoids cloud APIs and remote processing. The backend sanitizes generated filenames and never executes shell strings; FFmpeg is invoked with argument arrays.

For a production-grade local release, add file size limits, stronger content validation, automatic retention cleanup, and optional authentication for LAN exposure.
