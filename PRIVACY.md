# Privacy

Web Video Optimizer is designed for local media processing.

## What Stays Local

- Uploaded source videos are stored under the configured local `STORAGE_ROOT` or Docker volume.
- Optimized outputs, posters, captions, packages, temporary files, and `manifest.json` stay in managed local storage.
- FFmpeg, FFprobe, and whisper.cpp processing runs on your machine when those tools are installed locally.
- The app does not include analytics, telemetry, accounts, hosted storage, or remote video processing services.

## Optional Network Activity

The optional YouTube import feature uses your configured local yt-dlp executable to download the URL you provide. That necessarily contacts YouTube and any related network endpoints yt-dlp uses.

The browser talks to the local API base URL you configure with `VITE_API_BASE_URL`. If you bind the API to a LAN address, other devices on that trusted network may be able to reach it.

## Local Storage And Deletion

The Library and Results views can delete sources, jobs, and generated artifacts from managed storage. Storage cleanup removes stale temporary files. Docker users should remember that media persists in the `video_data` volume until it is deleted from the app or the volume is removed.

## Logs And Metadata

The API may log operational messages and tool errors to the terminal. Avoid sharing logs publicly if they contain filenames, paths, URLs, or transcript text you consider private.

## Third-Party Tools

FFmpeg, FFprobe, yt-dlp, and whisper.cpp are separate tools with their own behavior and licenses. Review those projects if you need deeper guarantees for your environment.
