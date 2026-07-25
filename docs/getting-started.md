# Getting Started

Web Video Optimizer can run directly with Node.js or with Docker Compose. Local Node is the recommended everyday workflow and does not require Docker.

## Requirements

- Node.js 20 or later.
- npm.
- Git.
- FFmpeg and FFprobe on PATH.
- A modern browser.
- Optional: Docker Desktop.
- Optional: yt-dlp for YouTube imports.
- Optional: whisper.cpp for local caption generation.

## Start WVO With Local Node

### Purpose

Start the local API and browser application for development.

### Before You Start

- Install Node.js 20 or later.
- Install FFmpeg and FFprobe.
- Put FFmpeg and FFprobe on PATH.

### Procedure

1. Clone the repository.

   ```powershell
   git clone https://github.com/Artsen/web-video-optimizer.git
   ```

2. Open the repository root.

   ```powershell
   cd web-video-optimizer
   ```

3. Install dependencies.

   ```powershell
   npm ci
   ```

4. Start the API and web app.

   ```powershell
   npm run dev
   ```

5. Open <http://localhost:5173>.

### Result

The browser opens WVO. The API listens on <http://localhost:4000>. Keep the API running while you use the web interface.

### Recovery

If PowerShell blocks `npm.ps1`, run:

```powershell
npm.cmd run dev
```

If the browser cannot reach the API, confirm that port `4000` is available and that the API process is running.

## Start Services In Separate Consoles

### Purpose

Run the API and web app in separate terminals.

### Procedure

1. Start the API.

   ```powershell
   npm run dev:api
   ```

2. In a second terminal, start the web app.

   ```powershell
   npm run dev:web
   ```

3. Open <http://localhost:5173>.

### Result

The API listens on <http://localhost:4000>. The web app runs at <http://localhost:5173>.

## Start WVO With Docker Compose

### Purpose

Start WVO with Docker Compose when Docker is available.

### Before You Start

- Install Docker Desktop.
- Decide whether the Docker `video_data` volume can store local runtime media.

### Procedure

1. Clone the repository.

   ```powershell
   git clone https://github.com/Artsen/web-video-optimizer.git
   ```

2. Open the repository root.

   ```powershell
   cd web-video-optimizer
   ```

3. Start Docker Compose.

   ```powershell
   docker compose up --build
   ```

4. Open <http://localhost:5173>.

### Result

The API listens on <http://localhost:4000>. Docker stores runtime media in the `video_data` volume. Inside Docker, the API binds to `0.0.0.0` with `ALLOW_LAN_ACCESS=true` so the published host port can reach the container.

### Stop Docker Compose

1. Press `Ctrl+C`.
2. Stop the containers.

   ```powershell
   docker compose down
   ```

Use `docker compose down -v` only when you intentionally want to remove the stored media volume.

## Check FFmpeg

### Purpose

Confirm that the API can invoke FFmpeg and FFprobe.

### Procedure

1. Check FFmpeg.

   ```powershell
   ffmpeg -version
   ```

2. Check FFprobe.

   ```powershell
   ffprobe -version
   ```

### Recovery

If either command fails, install FFmpeg, add the FFmpeg `bin` directory to PATH, and reopen the terminal.

## Enable Optional LAN Access

### Purpose

Allow another device on a trusted local network to use WVO.

### Warning

The API has no login system. Enable LAN access only on a trusted network.

### Procedure

1. Set the API bind host.

   ```powershell
   $env:HOST = "0.0.0.0"
   ```

2. Allow non-loopback binding.

   ```powershell
   $env:ALLOW_LAN_ACCESS = "true"
   ```

3. Set allowed web origins.

   ```powershell
   $env:CORS_ORIGIN = "http://localhost:5173,http://YOUR-LAN-IP:5173"
   ```

4. Set the browser API base URL.

   ```powershell
   $env:VITE_API_BASE_URL = "http://YOUR-LAN-IP:4000"
   ```

5. Restart both dev servers.

### Result

Another device on the trusted network can open the web app and send requests to the local API.

## Enable Optional YouTube Import

### Purpose

Allow WVO to import supported YouTube URLs through yt-dlp.

### Procedure

1. Install yt-dlp.
2. Set the yt-dlp executable path.

   ```powershell
   $env:YT_DLP_BIN = "C:\path\to\yt-dlp.exe"
   ```

3. Restart the API.

### Result

WVO can import supported YouTube URLs. The yt-dlp tool contacts YouTube and related network endpoints when it downloads the provided URL.

### Optional Override

The API passes its Node runtime to yt-dlp as the JavaScript runtime. Override the runtime only if needed:

```powershell
$env:YT_DLP_JS_RUNTIME = "node:C:\Program Files\nodejs\node.exe"
```

## Enable Optional Local Captions

### Purpose

Allow WVO to generate captions with local whisper.cpp.

### Procedure

1. Install whisper.cpp.
2. Download a local whisper.cpp model.
3. Set the whisper.cpp executable path.

   ```powershell
   $env:WHISPER_CPP_BIN = "C:\path\to\whisper-cli.exe"
   ```

4. Set the model path.

   ```powershell
   $env:WHISPER_CPP_MODEL = "C:\path\to\ggml-base.en.bin"
   ```

5. Restart the API.

### Result

Caption generation runs locally with the configured executable and model.
