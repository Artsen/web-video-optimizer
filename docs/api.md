# API Reference

The API is a local Express server. It accepts strict JSON bodies, rejects unknown request keys, returns JSON errors, supports server-sent job events, and streams media outputs with HTTP byte-range support.

The default base URL is:

```text
http://localhost:4000
```

## Health And Capabilities

| Method | Path                | Purpose                                                    |
| ------ | ------------------- | ---------------------------------------------------------- |
| `GET`  | `/health`           | Returns API health.                                        |
| `GET`  | `/api/capabilities` | Reports FFmpeg, whisper.cpp, and yt-dlp capability status. |

## Sources

| Method   | Path                       | Purpose                                                                     |
| -------- | -------------------------- | --------------------------------------------------------------------------- |
| `POST`   | `/api/videos`              | Upload and admit a source video through multipart form data.                |
| `POST`   | `/api/videos/url`          | Import a validated YouTube URL through configured yt-dlp.                   |
| `GET`    | `/api/videos/:id/source`   | Stream the source video inline.                                             |
| `GET`    | `/api/videos/:id/download` | Download the original source video.                                         |
| `PATCH`  | `/api/videos/:id`          | Rename the source display filename. Body: `{ "originalName": "name.mp4" }`. |
| `DELETE` | `/api/videos/:id`          | Delete a source and its associated managed files.                           |

## Jobs

| Method   | Path                     | Purpose                                                                                    |
| -------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `POST`   | `/api/videos/:id/jobs`   | Create an optimization job from optional encoding settings.                                |
| `POST`   | `/api/videos/:id/pair`   | Create the default website pair: compatible MP4 and modern WebM.                           |
| `POST`   | `/api/videos/:id/sample` | Create a short sample encode. Body can include `sampleSeconds` plus optimization settings. |
| `POST`   | `/api/videos/:id/poster` | Create a poster image. Body: `{ "atSeconds": 3 }`.                                         |
| `GET`    | `/api/jobs/:id`          | Get a job by ID.                                                                           |
| `GET`    | `/api/jobs/:id/events`   | Subscribe to job updates with server-sent events.                                          |
| `PATCH`  | `/api/jobs/:id`          | Rename a job output. Body: `{ "outputFileName": "name.mp4" }`.                             |
| `POST`   | `/api/jobs/:id/cancel`   | Cancel a queued or running job.                                                            |
| `DELETE` | `/api/jobs/:id`          | Delete a job and its managed artifacts.                                                    |
| `POST`   | `/api/jobs/:id/reveal`   | Ask the desktop environment to reveal the output file.                                     |

## Outputs

| Method | Path                     | Purpose                                       |
| ------ | ------------------------ | --------------------------------------------- |
| `GET`  | `/api/jobs/:id/output`   | Stream a completed output inline for preview. |
| `GET`  | `/api/jobs/:id/download` | Download a completed output.                  |
| `GET`  | `/api/jobs/:id/sidecar`  | Download a sidecar output such as `.srt`.     |

Preview endpoints support valid `Range` headers, including suffix ranges used by browser video playback.

## Captions

| Method | Path                          | Purpose                                                                 |
| ------ | ----------------------------- | ----------------------------------------------------------------------- |
| `POST` | `/api/videos/:id/subtitles`   | Create a subtitle-generation job when whisper.cpp is configured.        |
| `GET`  | `/api/jobs/:id/captions`      | Read generated caption text.                                            |
| `PUT`  | `/api/jobs/:id/captions`      | Replace generated VTT captions. Body: `{ "vtt": "WEBVTT..." }`.         |
| `POST` | `/api/jobs/:id/mux-subtitles` | Create a remux job that embeds subtitles into a completed video output. |

## Packages

| Method | Path                      | Purpose                                                                                |
| ------ | ------------------------- | -------------------------------------------------------------------------------------- |
| `POST` | `/api/videos/:id/package` | Create a website ZIP package. Body can include selected `jobIds` and package metadata. |

Package metadata supports optional `title`, `description`, `language`, and `filenamePrefix`.

## History And Storage

| Method | Path                   | Purpose                                       |
| ------ | ---------------------- | --------------------------------------------- |
| `GET`  | `/api/history`         | Return the persisted source/job snapshot.     |
| `POST` | `/api/history/delete`  | Bulk-delete selected `videoIds` and `jobIds`. |
| `GET`  | `/api/storage`         | Return managed storage status.                |
| `POST` | `/api/storage/cleanup` | Remove stale temporary managed files.         |

## Errors

Validation failures return a structured error:

```json
{
  "error": "Request validation failed.",
  "code": "VALIDATION_ERROR",
  "details": [{ "path": "crf", "message": "Number must be less than or equal to 63" }]
}
```

The API may also return `404` for missing videos/jobs/outputs, `413` for upload/body limits, and `507` when storage policy rejects work because capacity is too low.

## Security Notes

The API has no authentication. Keep it bound to loopback unless you explicitly need trusted LAN access. Do not expose it directly to the public internet.
