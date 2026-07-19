# Troubleshooting

## `node`, `npm`, Or `git` Is Not Recognized

Reopen PowerShell after installing tools so PATH changes apply. You can also temporarily add common install paths:

```powershell
$env:Path = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Program Files\GitHub CLI;$env:Path"
```

## PowerShell Blocks `npm.ps1`

Use `npm.cmd`:

```powershell
npm.cmd run dev
```

Or update your PowerShell execution policy for your user account if you are comfortable doing that.

## FFmpeg Or FFprobe Is Missing

Confirm both commands work:

```powershell
ffmpeg -version
ffprobe -version
```

Install FFmpeg, add its `bin` directory to PATH, and restart the terminal.

## Ports Are In Use

The defaults are API `4000` and web `5173`. Stop stale dev processes or choose another port:

```powershell
$env:PORT = "4001"
$env:VITE_API_BASE_URL = "http://localhost:4001"
```

## Browser Cannot Upload From Another Laptop

When using a LAN IP, configure both the API and web origin:

```powershell
$env:HOST = "0.0.0.0"
$env:ALLOW_LAN_ACCESS = "true"
$env:CORS_ORIGIN = "http://localhost:5173,http://YOUR-LAN-IP:5173"
$env:VITE_API_BASE_URL = "http://YOUR-LAN-IP:4000"
```

Restart both dev servers. Only use this on a trusted network because the API has no login.

## Video Preview Is Blank But Download Works

Some codec/container combinations cannot be decoded by every browser. Use the compatible H.264 MP4 fallback for broad preview support. WebM and AV1 require browser support. The API supports byte ranges for browser playback, including suffix ranges.

## Upload Fails With `413`

The file or JSON body is above the configured limit. Check:

- `UPLOAD_FILE_SIZE_LIMIT_BYTES`
- `JSON_BODY_LIMIT_BYTES`

Restart the API after changing limits.

## Job Fails With Storage Or Capacity Errors

Check the Library storage status and cleanup stale temporary files. You can also adjust:

- `MIN_FREE_STORAGE_BYTES`
- `MAX_MANAGED_STORAGE_BYTES`
- `STORAGE_ROOT`

Do not point `STORAGE_ROOT` at a folder containing unrelated user files.

## YouTube Import Does Nothing Or Fails

Confirm yt-dlp works in the terminal and set `YT_DLP_BIN`. Some YouTube extraction paths require a JavaScript runtime; the API passes its current Node runtime by default, but you can override `YT_DLP_JS_RUNTIME`.

Only HTTPS YouTube hosts are accepted.

## Captions Are Unavailable

Caption generation requires both:

- `WHISPER_CPP_BIN`
- `WHISPER_CPP_MODEL`

Restart the API after setting them. If the video already has embedded subtitles, the app reports that status from FFprobe.

## `npm ci` Fails On Windows With Locked Files

Stop stale dev/test Node processes that are using project dependencies, then rerun the command. Do not delete source files to work around a local lock.

## Where Test Artifacts Go

- Playwright diagnostics: `playwright-report/` and `test-results/`
- UI screenshot review: `.tmp/ui-review/`
- API media integration diagnostics: `apps/api/integration-artifacts/`

These are generated artifacts and should not be committed.
