# User Guide

Web Video Optimizer is built around a source workspace. Prepare is where you add or tune a source; Results is where completed outputs, packages, captions, and comparison tools become useful.

## Add A Source

Use the Prepare screen to upload a video by choosing a file or dragging one into the upload area. If yt-dlp is configured, you can also paste a supported YouTube URL and let the API import it first.

![Prepare workspace](assets/screenshots/prepare-dark.webp)

After a source is admitted, the app shows metadata such as dimensions, duration, codecs, audio status, subtitle tracks, and estimated source size. The source can be renamed without changing the underlying media content.

## Optimize For Website

The main website workflow creates two outputs:

- a compatible H.264 MP4 fallback
- a modern WebM/AV1 output

Jobs are queued through the API scheduler. Progress appears in the Results workspace and survives browser refreshes through the saved history manifest.

## Review Results

![Results workspace](assets/screenshots/results-dark.webp)

In Results you can:

- select an output
- preview video or poster output
- download the original source or completed jobs
- rename completed job filenames
- cancel queued or running work
- delete outputs or sources
- create posters, captions, remuxed subtitles, and packages
- copy generated embed code

Processed historical sources open directly to Results. New or unprocessed sources open to Prepare.

## Compare Outputs

![Compare theatre](assets/screenshots/compare-wipe-dark.webp)

Compare is a theatre-style view for checking visual quality. It supports multiple layouts and modes, including side-by-side, stacked, overlay, and wipe comparison. Playback can be synchronized across videos.

The URL restores selected output, mode, layout, and visible versions. Playback time, volume, zoom, pan, wipe position, and fullscreen are intentionally treated as temporary review state.

## Create Posters

Generate a WebP poster from the source video. The poster can be previewed in a lightbox, downloaded, and included in the website package.

## Captions And Subtitles

If FFprobe finds embedded subtitle tracks, the app reports them. If no subtitle track exists and the source has audio, the app can generate captions with local whisper.cpp when configured.

Generated captions can be:

- previewed over the video
- edited in the caption theatre
- downloaded as `.vtt` or `.srt`
- included as sidecar files in the ZIP package
- remuxed into completed MP4/WebM outputs

## Website Package

The package job creates a ZIP intended for website handoff. It can include optimized videos, poster artwork, caption files, transcript markup, and SEO-friendly `VideoObject` structured data.

The embed snippet uses local relative filenames so the video, poster, and captions can be served from the same site directory.

## Custom Export

![Custom export controls](assets/screenshots/custom-export-dark.webp)

Custom Export lets you choose container, codec, width, frame rate, CRF, preset, audio mode, bitrate, sample rate, channel count, fast-start, metadata stripping, and output filename. Use it when the default website pair is not the right fit.

## Library And Storage

The Library view shows previous sources and jobs from the manifest. You can reopen sources, delete old videos or outputs, and run storage cleanup for stale temporary files.

The API stores managed media under `STORAGE_ROOT`; Docker uses the `video_data` volume.
