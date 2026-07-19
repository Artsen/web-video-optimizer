# Getting Started

Web Video Optimizer can run with Docker Compose or directly with Node.js. Docker is simplest when available; local Node is more convenient for active development.

## Requirements

- Node.js 20 or newer
- npm
- FFmpeg and FFprobe
- Git
- Optional: Docker Desktop
- Optional: yt-dlp for YouTube imports
- Optional: whisper.cpp for local caption generation

## Docker Compose

```powershell
git clone https://github.com/Artsen/web-video-optimizer.git
cd web-video-optimizer
docker compose up --build
```

Open <http://localhost:5173>.

The API listens on <http://localhost:4000>. Runtime media is stored in the Docker `video_data` volume. Stop the app with `Ctrl+C`, then run:

```powershell
docker compose down
```

Use `docker compose down -v` only when you intentionally want to remove the stored media volume.

## Local Node

Install dependencies:

```powershell
git clone https://github.com/Artsen/web-video-optimizer.git
cd web-video-optimizer
npm ci
```

Start both API and web:

```powershell
npm run dev
```

Open <http://localhost:5173>.

If PowerShell blocks `npm.ps1`, use:

```powershell
npm.cmd run dev
```

## Separate Dev Consoles

You can also run the API and web app separately:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

The default API is <http://localhost:4000>. The default web app is <http://localhost:5173>.

## FFmpeg

The API expects `ffmpeg` and `ffprobe` on PATH.

```powershell
ffmpeg -version
ffprobe -version
```

If either command fails, install FFmpeg and reopen the terminal so PATH changes apply.

## Optional LAN Access

The API defaults to loopback-only binding. To access it from another device on your trusted network, configure both the API bind address and CORS origins:

```powershell
$env:HOST = "0.0.0.0"
$env:ALLOW_LAN_ACCESS = "true"
$env:CORS_ORIGIN = "http://localhost:5173,http://YOUR-LAN-IP:5173"
$env:VITE_API_BASE_URL = "http://YOUR-LAN-IP:4000"
```

The API has no login system. Only enable LAN access on a trusted network.

## Optional YouTube Import

Install yt-dlp and set:

```powershell
$env:YT_DLP_BIN = "C:\path\to\yt-dlp.exe"
```

The API automatically passes its Node runtime to yt-dlp as the JavaScript runtime. Override it only if needed:

```powershell
$env:YT_DLP_JS_RUNTIME = "node:C:\Program Files\nodejs\node.exe"
```

Only supported YouTube URLs are accepted.

## Optional Local Captions

Install whisper.cpp and download a local model. Then set:

```powershell
$env:WHISPER_CPP_BIN = "C:\path\to\whisper-cli.exe"
$env:WHISPER_CPP_MODEL = "C:\path\to\ggml-base.en.bin"
```

Restart the API after changing these variables. Caption generation runs locally with the configured executable and model.
