# Configuration

The API reads environment variables at startup. Restart the API after changing an API variable. The web app reads `VITE_API_BASE_URL` when the Vite app starts or builds.

## Change A Configuration Value

### Purpose

Change WVO runtime configuration for a local development session.

### Before You Start

- Stop the API when you change API variables.
- Stop the Vite web app when you change `VITE_API_BASE_URL`.
- Record values that contain private local paths outside public issues and pull requests.

### Procedure

1. Set the environment variable in the terminal that will start the process.
2. Start or restart the affected process.
3. Open <http://localhost:5173>.
4. If the change affects API readiness, open <http://localhost:4000/ready>.

### Result

The affected process starts with the new value.

### Recovery

If WVO does not use the new value, confirm that the variable was set in the same terminal that started the process.

## Core

| Variable                | Default                                       | Description                                                         |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `HOST`                  | `127.0.0.1`                                   | API bind host. Non-loopback hosts require `ALLOW_LAN_ACCESS=true`.  |
| `PORT`                  | `4000`                                        | API port.                                                           |
| `ALLOW_LAN_ACCESS`      | `false`                                       | Allows binding outside loopback when set to `true`.                 |
| `CORS_ORIGIN`           | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allowed web origins. Wildcards are rejected.        |
| `VITE_API_BASE_URL`     | browser host with port `4000`                 | Web app API base URL. `.env.example` uses `http://localhost:4000`.  |
| `JSON_BODY_LIMIT_BYTES` | `5242880`                                     | Maximum JSON body size, also used to bound caption update payloads. |

## Storage

| Variable                       | Default                                     | Description                                                                                        |
| ------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `STORAGE_ROOT`                 | `../../data` from the API working directory | Managed storage root for uploads, outputs, temp files, and manifest. `.env.example` uses `./data`. |
| `UPLOAD_FILE_SIZE_LIMIT_BYTES` | `2147483648`                                | Maximum admitted upload size.                                                                      |
| `MIN_FREE_STORAGE_BYTES`       | `536870912`                                 | Minimum free filesystem space to preserve.                                                         |
| `MAX_MANAGED_STORAGE_BYTES`    | `0`                                         | Maximum managed storage size; `0` disables the cap.                                                |
| `TEMP_FILE_MAX_AGE_MS`         | `86400000`                                  | Age threshold for stale temporary cleanup.                                                         |
| `HOUSEKEEPING_INTERVAL_MS`     | `3600000`                                   | Interval for background storage housekeeping.                                                      |

Managed areas are `uploads`, `outputs`, `tmp`, and `tmp/upload-staging`. The API does not serve files outside those areas.

Important: Do not point `STORAGE_ROOT` at a directory that contains unrelated user files. Delete and cleanup actions operate inside managed storage.

## Media Jobs

| Variable                            | Default   | Description                                           |
| ----------------------------------- | --------- | ----------------------------------------------------- |
| `MAX_CONCURRENT_MEDIA_JOBS`         | `1`       | Number of media jobs allowed to run at once.          |
| `SHUTDOWN_GRACE_PERIOD_MS`          | `15000`   | Time allowed for graceful scheduler/process shutdown. |
| `MEDIA_PROCESS_TIMEOUT_MS`          | `1800000` | Timeout for long-running media processes.             |
| `TOOL_COMMAND_TIMEOUT_MS`           | `60000`   | Timeout for shorter capability/probe/tool commands.   |
| `PROCESS_KILL_GRACE_PERIOD_MS`      | `5000`    | Delay between polite termination and forceful kill.   |
| `MAX_CAPTURED_PROCESS_OUTPUT_BYTES` | `4194304` | Maximum captured stdout/stderr per process.           |

## Optional Tools

| Variable            | Default                  | Description                                    |
| ------------------- | ------------------------ | ---------------------------------------------- |
| `YT_DLP_BIN`        | unset                    | Path to yt-dlp executable for YouTube imports. |
| `YT_DLP_JS_RUNTIME` | current API Node runtime | JavaScript runtime passed to yt-dlp.           |
| `WHISPER_CPP_BIN`   | unset                    | Path to whisper.cpp `whisper-cli` executable.  |
| `WHISPER_CPP_MODEL` | unset                    | Path to a local whisper.cpp model file.        |

FFmpeg and FFprobe are invoked from PATH.

Result: If optional tools are not configured, WVO still supports local upload, probing, optimization, comparison, posters, packages, and downloads. YouTube import and caption generation remain unavailable until their variables are configured.

## Docker Compose

Docker Compose sets:

- API `HOST=0.0.0.0`
- API `PORT=4000`
- API `ALLOW_LAN_ACCESS=true`
- API `CORS_ORIGIN=http://localhost:5173`
- API `STORAGE_ROOT=/app/data`
- web `VITE_API_BASE_URL=http://localhost:4000`

The `/app/data` path is backed by the `video_data` Docker volume. Docker uses non-loopback API binding only so the published host port can reach the API inside the container; local Node development defaults to loopback-only binding unless you explicitly enable LAN access.
