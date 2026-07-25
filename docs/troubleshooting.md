# Troubleshooting

## `node`, `npm`, Or `git` Is Not Recognized

Cause: The terminal usually does not have the tool directory on PATH.

Recovery: Reopen PowerShell after installing tools so PATH changes apply. You can also temporarily add common install paths:

```powershell
$env:Path = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Program Files\GitHub CLI;$env:Path"
```

## PowerShell Blocks `npm.ps1`

Recovery: Use `npm.cmd`:

```powershell
npm.cmd run dev
```

You can also update the PowerShell execution policy for your user account if you are comfortable with that system change.

## FFmpeg Or FFprobe Is Missing

Recovery: Confirm both commands work:

```powershell
ffmpeg -version
ffprobe -version
```

If either command fails, install FFmpeg, add the FFmpeg `bin` directory to PATH, and restart the terminal.

## Ports Are In Use

Cause: Another process is using API port `4000` or web port `5173`.

Recovery: Stop stale dev processes or choose another API port:

```powershell
$env:PORT = "4001"
$env:VITE_API_BASE_URL = "http://localhost:4001"
```

## Browser Cannot Upload From Another Laptop

Cause: The browser on the other device cannot reach the local API, or CORS does not allow the LAN origin.

Recovery: When using a LAN IP, configure both the API bind address and the web origin:

```powershell
$env:HOST = "0.0.0.0"
$env:ALLOW_LAN_ACCESS = "true"
$env:CORS_ORIGIN = "http://localhost:5173,http://YOUR-LAN-IP:5173"
$env:VITE_API_BASE_URL = "http://YOUR-LAN-IP:4000"
```

Restart both dev servers. Only use LAN access on a trusted network because the API has no login.

## Video Preview Is Blank But Download Works

Cause: Some codec and container combinations cannot be decoded by every browser.

Recovery: Use the MP4 fallback for broad preview support. WebM and AV1 require browser support. The API supports byte ranges for browser playback, including suffix ranges.

## Upload Fails With `413`

Cause: The source video or JSON body is above the configured limit.

Recovery: Check:

- `UPLOAD_FILE_SIZE_LIMIT_BYTES`
- `JSON_BODY_LIMIT_BYTES`

Restart the API after changing limits.

## Job Fails With Storage Or Capacity Errors

Cause: Managed storage does not have enough allowed space for the requested job.

Recovery: Check the Library storage status and clean up stale temporary files. You can also adjust:

- `MIN_FREE_STORAGE_BYTES`
- `MAX_MANAGED_STORAGE_BYTES`
- `STORAGE_ROOT`

Do not point `STORAGE_ROOT` at a folder containing unrelated user files.

## YouTube Import Does Nothing Or Fails

Recovery: Confirm yt-dlp works in the terminal and set `YT_DLP_BIN`. Some YouTube extraction paths require a JavaScript runtime; the API passes its current Node runtime by default, but you can override `YT_DLP_JS_RUNTIME`.

Only HTTPS YouTube hosts are accepted.

## Captions Are Unavailable

Caption generation requires both:

- `WHISPER_CPP_BIN`
- `WHISPER_CPP_MODEL`

Recovery: Restart the API after setting them. If the source video already has an embedded subtitle track, WVO reports that status from FFprobe.

## `npm ci` Fails On Windows With Locked Files

Cause: A stale dev or test process can keep a dependency file locked.

Recovery: Stop stale dev/test Node processes that are using project dependencies, then rerun the command. Do not delete source files to work around a local lock.

## Where Test Artifacts Go

- Playwright diagnostics: `playwright-report/` and `test-results/`
- UI screenshot review: `.tmp/ui-review/`
- API media integration diagnostics: `apps/api/integration-artifacts/`

These are generated artifacts and should not be committed.
