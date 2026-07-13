import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import { nanoid } from "nanoid";
import type { JobDto } from "@local-video-optimizer/contracts";
import { normalizeOptimizationSettings, sanitizeFileName } from "@local-video-optimizer/video-core";
import type { JobEntity } from "../entities/job-entity.js";
import type { JobRepository, VideoRepository } from "../repositories/repository-types.js";
import type { JobService } from "./job-service.js";
import type { StatePersistenceService } from "./state-persistence-service.js";
import {
  buildZipArchive,
  cleanCaptionText,
  compactJsonObject,
  escapeHtml,
  isoDuration,
  jsonForHtml,
  transcriptFromVtt
} from "./helpers/package-builders.js";

export class PackageService {
  constructor(
    private readonly videos: VideoRepository,
    private readonly jobs: JobRepository,
    private readonly outputDir: string,
    private readonly persistence: StatePersistenceService,
    private readonly jobService: JobService
  ) {}

  async createPackageJob(
    videoId: string,
    body: unknown
  ): Promise<{ status: 201 | 400 | 404; job?: JobDto; error?: string }> {
    const video = this.videos.get(videoId);
    if (!video) {
      return { status: 404, error: "Video not found" };
    }

    const requestBody = (body ?? {}) as { jobIds?: unknown; metadata?: Record<string, unknown> };
    const requestedJobIds = Array.isArray(requestBody.jobIds) ? (requestBody.jobIds as string[]) : [];
    const packageMeta = requestBody.metadata ?? {};
    const packageTitle = String(packageMeta.title || path.parse(video.originalName).name).trim();
    const packageDescription = String(packageMeta.description || `Video for ${packageTitle}.`).trim();
    const packageLanguage = String(packageMeta.language || "en").trim() || "en";
    const filenamePrefix =
      sanitizeFileName(String(packageMeta.filenamePrefix || path.parse(video.originalName).name).trim()) ||
      sanitizeFileName(path.parse(video.originalName).name);
    const candidateJobs = this.jobs
      .getAll()
      .filter(
        (job) =>
          job.videoId === video.id &&
          job.status === "completed" &&
          job.outputPath &&
          (job.kind === "encode" || job.kind === "mux" || job.kind === "poster" || job.kind === "subtitle") &&
          (requestedJobIds.length === 0 || requestedJobIds.includes(job.id))
      );
    const encodeJobs = candidateJobs.filter((job) => job.kind === "encode" || job.kind === "mux");
    const posterJob = candidateJobs.find((job) => job.kind === "poster");
    const subtitleJob = candidateJobs.find((job) => job.kind === "subtitle");
    if (encodeJobs.length === 0) {
      return { status: 400, error: "Create at least one completed video export before packaging." };
    }

    const posterName = posterJob?.outputFileName ?? "poster.webp";
    const preferredContentJob = encodeJobs.find((job) => job.settings.outputContainer === "mp4") ?? encodeJobs[0];
    const sources = encodeJobs
      .map((job) => {
        const type = job.settings.outputContainer === "webm" ? "video/webm" : "video/mp4";
        return `    <source src="${escapeHtml(job.outputFileName!)}" type="${type}">`;
      })
      .join("\n");
    const hasSilent = encodeJobs.some((job) => job.settings.audioMode === "remove");
    const attrs = hasSilent ? 'autoplay muted loop playsinline preload="metadata"' : 'controls preload="metadata"';
    const captionText =
      subtitleJob?.outputPath && fs.existsSync(subtitleJob.outputPath)
        ? cleanCaptionText(await fs.promises.readFile(subtitleJob.outputPath, "utf8"))
        : "";
    const transcriptText = transcriptFromVtt(captionText);
    const transcriptName = subtitleJob?.outputFileName ? `${filenamePrefix}-transcript.txt` : "";
    const track = subtitleJob?.outputFileName
      ? `    <track src="${escapeHtml(subtitleJob.outputFileName)}" kind="subtitles" srclang="${escapeHtml(packageLanguage)}" label="Captions" default>`
      : "";
    const schema = compactJsonObject({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: packageTitle,
      description: packageDescription,
      thumbnailUrl: posterName,
      uploadDate: video.uploadedAt,
      duration: isoDuration(video.metadata.durationSeconds),
      contentUrl: preferredContentJob?.outputFileName
    });
    const previewSnippet = `<figure class="web-video-embed">
  <video ${attrs} poster="${escapeHtml(posterName)}" aria-label="${escapeHtml(packageTitle)}">
${sources}
  </video>
  ${
    transcriptText
      ? `<figcaption>
    <details>
      <summary>Transcript for ${escapeHtml(packageTitle)}</summary>
      <p>${escapeHtml(transcriptText).replace(/\n/g, "<br>")}</p>
    </details>
  </figcaption>`
      : ""
  }
</figure>`;
    const productionSnippet = `<figure class="web-video-embed">
  <video ${attrs} poster="${escapeHtml(posterName)}" aria-label="${escapeHtml(packageTitle)}">
${sources}${track ? `\n${track}` : ""}
  </video>
  ${
    transcriptText
      ? `<figcaption>
    <details>
      <summary>Transcript for ${escapeHtml(packageTitle)}</summary>
      <p>${escapeHtml(transcriptText).replace(/\n/g, "<br>")}</p>
    </details>
  </figcaption>`
      : ""
  }
</figure>
<script type="application/ld+json">${jsonForHtml(schema)}</script>`;
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(packageTitle)} - Web Video Embed</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; gap: 18px; padding: 24px; font-family: system-ui, sans-serif; color: #f7f7f7; background: #111; box-sizing: border-box; }
    main { width: min(1080px, 100%); display: grid; gap: 14px; }
    .web-video-embed { display: grid; gap: 10px; margin: 0; }
    video { width: 100%; aspect-ratio: ${video.metadata.width && video.metadata.height ? `${video.metadata.width} / ${video.metadata.height}` : "16 / 9"}; background: #000; border-radius: 10px; }
    video::cue { color: #fff; background: rgba(0, 0, 0, 0.72); font-size: 1.05rem; line-height: 1.35; }
    details { color: #d8d8d8; }
    summary { cursor: pointer; font-weight: 700; }
    p, pre { margin: 0; color: #c9c9c9; }
    pre { overflow: auto; padding: 14px; border: 1px solid #333; border-radius: 8px; background: #181818; font-size: 0.85rem; }
    .snippet-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .snippet-toolbar strong { color: #f7f7f7; }
    button { padding: 8px 11px; border: 1px solid #444; border-radius: 7px; color: #f7f7f7; background: #222; cursor: pointer; }
    button:hover { background: #2e2e2e; }
  </style>
  <script type="application/ld+json">${jsonForHtml(schema)}</script>
</head>
<body>
  <main>
    ${previewSnippet}
    ${subtitleJob?.outputFileName ? `<p>Captions are included as <code>${escapeHtml(subtitleJob.outputFileName)}</code>. This preview forces the default subtitle track on; on a production site users can toggle captions in the video controls.</p>` : "<p>No captions were selected for this package.</p>"}
    <div class="snippet-toolbar">
      <strong>Production Embed</strong>
      <button type="button" id="copy-embed" aria-describedby="copy-status">Copy</button>
    </div>
    <pre id="embed-code">${escapeHtml(productionSnippet)}</pre>
    <p id="copy-status" aria-live="polite"></p>
  </main>
  <script>
    const video = document.querySelector("video");
    const inlineVtt = ${jsonForHtml(captionText)};
    const embedCode = ${jsonForHtml(productionSnippet)};
    const copyButton = document.querySelector("#copy-embed");
    const copyStatus = document.querySelector("#copy-status");

    function showCaptions() {
      if (!video) return;
      for (const track of video.textTracks) track.mode = "showing";
    }

    function useInlineCaptions() {
      if (!video || !inlineVtt) return;
      const inlineTrack = document.createElement("track");
      inlineTrack.kind = "subtitles";
      inlineTrack.srclang = ${jsonForHtml(packageLanguage)};
      inlineTrack.label = "Captions";
      inlineTrack.default = true;
      inlineTrack.src = URL.createObjectURL(new Blob([inlineVtt], { type: "text/vtt" }));
      video.appendChild(inlineTrack);
      inlineTrack.addEventListener("load", showCaptions);
      window.setTimeout(showCaptions, 250);
    }

    useInlineCaptions();
    video?.addEventListener("loadedmetadata", showCaptions);
    window.setTimeout(showCaptions, 250);

    copyButton?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(embedCode);
        copyStatus.textContent = "Copied embed code.";
        copyButton.textContent = "Copied";
        window.setTimeout(() => {
          copyButton.textContent = "Copy";
          copyStatus.textContent = "";
        }, 1800);
      } catch {
        copyStatus.textContent = "Copy failed. Select the code block and copy it manually.";
      }
    });
  </script>
</body>
</html>
`;
    const readme = [
      "Web Video Package",
      "=================",
      "",
      `Source: ${video.originalName}`,
      `Title: ${packageTitle}`,
      `Description: ${packageDescription}`,
      `Language: ${packageLanguage}`,
      `Created: ${new Date().toISOString()}`,
      "",
      "Files:",
      ...encodeJobs.map(
        (job) => `- ${job.outputFileName} (${job.settings.outputContainer.toUpperCase()} / ${job.settings.videoCodec})`
      ),
      posterJob
        ? `- ${posterName} (poster image)`
        : "- poster.webp (placeholder referenced in embed.html; generate one in the app)",
      subtitleJob?.outputFileName
        ? `- ${subtitleJob.outputFileName} (WebVTT captions)`
        : "- captions.vtt (optional; generate subtitles in the app)",
      subtitleJob?.sidecarFileName ? `- ${subtitleJob.sidecarFileName} (SRT captions)` : "",
      transcriptName ? `- ${transcriptName} (plain-text transcript)` : "",
      "- embed.html",
      "",
      'Use preload="metadata" for most website videos and keep silent hero videos muted + playsinline.',
      "",
      "Accessibility and SEO:",
      "- embed.html includes captions, a transcript disclosure, fixed video aspect-ratio styling, and VideoObject JSON-LD.",
      "- Replace the generated VideoObject description with page-specific copy before publishing.",
      "",
      "Caption note:",
      "The embed.html preview forces the default caption track on and includes an inline WebVTT fallback for local file testing. On a real website, keep the .vtt file next to the video or update the <track src> path."
    ].join("\n");

    const entries = [
      ...(await Promise.all(
        encodeJobs.map(async (job) => ({
          name: job.outputFileName!,
          data: await fs.promises.readFile(job.outputPath!)
        }))
      )),
      ...(posterJob?.outputPath ? [{ name: posterName, data: await fs.promises.readFile(posterJob.outputPath) }] : []),
      ...(subtitleJob?.outputPath && subtitleJob.outputFileName
        ? [{ name: subtitleJob.outputFileName, data: await fs.promises.readFile(subtitleJob.outputPath) }]
        : []),
      ...(subtitleJob?.sidecarPath && subtitleJob.sidecarFileName && fs.existsSync(subtitleJob.sidecarPath)
        ? [{ name: subtitleJob.sidecarFileName, data: await fs.promises.readFile(subtitleJob.sidecarPath) }]
        : []),
      ...(transcriptName && transcriptText ? [{ name: transcriptName, data: Buffer.from(transcriptText) }] : []),
      { name: "embed.html", data: Buffer.from(html) },
      { name: "README.txt", data: Buffer.from(readme) }
    ];

    const zip = buildZipArchive(entries);
    const packageId = nanoid();
    const outputFileName = `${filenamePrefix}-web-package.zip`;
    const outputPath = path.join(this.outputDir, `${packageId}-${outputFileName}`);
    await fs.promises.writeFile(outputPath, zip);

    const job = this.jobService.createEncodeJob(
      video,
      normalizeOptimizationSettings({ outputFilename: path.parse(outputFileName).name }),
      "package",
      "web-package"
    ) as JobEntity;
    job.status = "completed";
    job.progress = 100;
    job.message = "Web package created";
    job.completedAt = new Date().toISOString();
    job.outputFileName = outputFileName;
    job.outputPath = outputPath;
    job.outputSize = zip.length;
    job.ffmpegCommand = "Generated package from completed outputs";
    await this.persistence.save();

    return { status: 201, job: this.jobService.publicJob(job) };
  }
}
