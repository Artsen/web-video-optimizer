# Architecture

## Overview

The app has two local services:

- `apps/web`: React + TypeScript UI served by Vite.
- `apps/api`: Express API that receives uploads, runs FFprobe/FFmpeg, and streams local files.

Docker Compose runs both services and installs FFmpeg in the API image.

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
