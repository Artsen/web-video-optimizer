import React from "react";
import ReactDOM from "react-dom/client";
import {
  BadgeCheck,
  Captions,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  Edit3,
  FileVideo,
  FolderOpen,
  Gauge,
  HelpCircle,
  History,
  Image,
  Layers,
  Moon,
  Package,
  Play,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UploadCloud,
  Volume2,
  Wand2,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import "./styles.css";
import {
  buildRecommendations,
  estimateOutputSize,
  normalizeOutputContainerChange,
  normalizeVideoCodecChange
} from "./video-ui";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? `${window.location.protocol}//${window.location.hostname}:4000`;

type VideoMetadata = {
  fileName: string;
  fileSize: number;
  durationSeconds: number;
  container: string;
  formatLongName?: string;
  videoCodec?: string;
  audioCodec?: string;
  trackCounts: { video: number; audio: number; subtitle: number };
  width?: number;
  height?: number;
  displayAspectRatio?: string;
  frameRate?: number;
  overallBitrate?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  pixelFormat?: string;
  color?: { space?: string; transfer?: string; primaries?: string };
  rotation?: string;
  tags?: Record<string, string>;
  webFriendly: boolean;
  warnings: string[];
};

type VideoRecord = {
  id: string;
  originalName: string;
  uploadedAt: string;
  metadata: VideoMetadata;
};

type Settings = {
  outputContainer: "mp4" | "webm";
  videoCodec: "libx264" | "libaom-av1" | "libvpx-vp9";
  audioCodec: "aac" | "libopus";
  width?: number;
  height?: number;
  crf: number;
  preset: "veryfast" | "fast" | "medium" | "slow";
  cpuUsed: number;
  rowMt: boolean;
  frameRate?: number;
  audioMode: "keep" | "compress" | "remove";
  audioBitrateKbps: number;
  audioSampleRate?: number;
  audioChannels?: number;
  fastStart: boolean;
  stripMetadata: boolean;
  outputFilename: string;
};

type Job = {
  id: string;
  videoId: string;
  kind: "encode" | "sample" | "poster" | "package" | "subtitle" | "mux";
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  progress: number;
  message?: string;
  outputSize?: number;
  outputFileName?: string;
  sidecarFileName?: string;
  ffmpegCommand: string;
  startedAt: string;
  completedAt?: string;
  settings: Settings;
  sampleEstimate?: {
    sampleSeconds: number;
    estimatedFullSize: number;
    estimatedReduction?: number;
  };
};

type HistoryVideo = VideoRecord & {
  jobIds: string[];
};

type HistorySnapshot = {
  videos: HistoryVideo[];
  jobs: Job[];
};

type Capabilities = {
  libx264: boolean;
  libaomAv1: boolean;
  libvpxVp9: boolean;
  aac: boolean;
  libopus: boolean;
  whisperCpp?: boolean;
  whisperModel?: boolean;
  whisperCommand?: string;
  ytDlp?: boolean;
  ytDlpCommand?: string;
};

type PackageMetadata = {
  title: string;
  description: string;
  language: string;
  filenamePrefix: string;
};

type PresetInfo = {
  label: string;
  description: string;
  icon: React.ReactNode;
};

const presets: Record<string, Partial<Settings>> = {
  "Maximum Compatibility": {
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    crf: 23,
    preset: "medium",
    audioMode: "compress",
    audioBitrateKbps: 128,
    fastStart: true,
    stripMetadata: true
  },
  "Silent Background": {
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    width: 1280,
    crf: 28,
    preset: "fast",
    frameRate: 24,
    audioMode: "remove",
    fastStart: true,
    stripMetadata: true
  },
  "Product / Marketing": {
    outputContainer: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    width: 1280,
    frameRate: 24,
    crf: 22,
    preset: "slow",
    audioMode: "compress",
    audioBitrateKbps: 160,
    audioSampleRate: 48000,
    audioChannels: 2,
    fastStart: true,
    stripMetadata: true
  },
  "AV1 Hero MP4": {
    outputContainer: "mp4",
    videoCodec: "libaom-av1",
    audioCodec: "aac",
    width: 1280,
    crf: 34,
    cpuUsed: 5,
    rowMt: true,
    frameRate: 24,
    audioMode: "remove",
    fastStart: true,
    stripMetadata: true
  },
  "AV1 WebM Small": {
    outputContainer: "webm",
    videoCodec: "libaom-av1",
    audioCodec: "libopus",
    width: 1280,
    crf: 34,
    cpuUsed: 5,
    rowMt: true,
    frameRate: 24,
    audioMode: "compress",
    audioBitrateKbps: 96,
    fastStart: false,
    stripMetadata: true
  }
};

const presetInfo: Record<string, PresetInfo> = {
  "Maximum Compatibility": {
    label: "Best fallback",
    description: "MP4, H.264, AAC, and fast-start for the broadest browser support.",
    icon: <ShieldCheck size={20} />
  },
  "Silent Background": {
    label: "Looping hero",
    description: "Smaller, muted video for backgrounds and above-the-fold hero sections.",
    icon: <Sparkles size={20} />
  },
  "Product / Marketing": {
    label: "Balanced export",
    description: "A polished H.264 marketing-video fallback with stereo AAC audio.",
    icon: <FileVideo size={20} />
  },
  "AV1 Hero MP4": {
    label: "Modern silent",
    description: "AV1 compression for compact silent hero video experiments.",
    icon: <Cpu size={20} />
  },
  "AV1 WebM Small": {
    label: "Small modern file",
    description: "AV1/WebM with Opus audio for modern browser delivery.",
    icon: <Package size={20} />
  }
};

const initialSettings: Settings = {
  outputContainer: "mp4",
  videoCodec: "libx264",
  audioCodec: "aac",
  crf: 24,
  preset: "medium",
  cpuUsed: 5,
  rowMt: true,
  audioMode: "compress",
  audioBitrateKbps: 128,
  audioSampleRate: 48000,
  audioChannels: 2,
  fastStart: true,
  stripMetadata: true,
  outputFilename: "optimized-video"
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanSubtitleDraft(vtt: string): string {
  const seen = new Set<string>();
  return vtt
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^\[(?:BLANK_AUDIO|MUSIC|SILENCE|NOISE|APPLAUSE|LAUGHTER)\]$/i.test(line.trim()))
    .filter((line) => {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.includes("-->") ||
        /^WEBVTT\b/i.test(trimmed) ||
        /^NOTE\b/i.test(trimmed) ||
        /^\d+$/.test(trimmed)
      )
        return true;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatBitrate(bits?: number): string {
  if (!bits) return "Unknown";
  return bits >= 1_000_000 ? `${(bits / 1_000_000).toFixed(2)} Mbps` : `${Math.round(bits / 1000)} kbps`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "Unknown";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${rest}`;
}

function codecLabel(codec: Settings["videoCodec"]): string {
  if (codec === "libx264") return "H.264";
  if (codec === "libaom-av1") return "AV1";
  return "VP9";
}

function qualityLabel(settings: Settings): string {
  if (settings.videoCodec === "libx264") {
    if (settings.crf <= 20) return "High quality";
    if (settings.crf <= 25) return "Balanced";
    if (settings.crf <= 30) return "Small file";
    return "Aggressive compression";
  }

  if (settings.crf <= 28) return "High quality";
  if (settings.crf <= 34) return "Balanced modern";
  if (settings.crf <= 38) return "Small modern file";
  return "Aggressive compression";
}

function fileSizeDelta(outputSize: number | undefined, originalSize: number): string {
  if (!outputSize || !originalSize) return "Unknown";
  const reduction = Math.round((1 - outputSize / originalSize) * 100);
  if (reduction > 0) return `${reduction}% smaller`;
  if (reduction < 0) return `${Math.abs(reduction)}% larger`;
  return "Same size";
}

function nextExportSuggestion(settings: Settings): string {
  if (settings.outputContainer === "webm" || settings.videoCodec !== "libx264") {
    return "Also create an MP4/H.264 fallback for older browsers and broad Safari coverage.";
  }

  return "This is a solid fallback. Add an AV1/WebM export if you want a smaller modern-browser source.";
}

function buildVideoMarkup(job: Job, settings: Settings): string {
  const fileName = job.outputFileName ?? `optimized-video.${settings.outputContainer}`;
  const type = settings.outputContainer === "webm" ? "video/webm" : "video/mp4";
  const attributes =
    settings.audioMode === "remove"
      ? 'autoplay muted loop playsinline preload="metadata"'
      : 'controls preload="metadata"';

  return `<video ${attributes} poster="poster.webp">
  <source src="${fileName}" type="${type}">
</video>`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      <strong>{value || "Unknown"}</strong>
    </div>
  );
}

function Help({ text }: { text: string }) {
  return (
    <span className="help" title={text} aria-label={text}>
      <HelpCircle size={15} />
    </span>
  );
}

function Label({ children, help }: { children: React.ReactNode; help: string }) {
  return (
    <span className="label-row">
      {children}
      <Help text={help} />
    </span>
  );
}

function SectionHeader({ icon, title, kicker }: { icon: React.ReactNode; title: string; kicker?: string }) {
  return (
    <div className="section-title">
      {icon}
      <div>
        <h2>{title}</h2>
        {kicker && <p>{kicker}</p>}
      </div>
    </div>
  );
}

function SettingsGroup({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="settings-group">
      <h3>
        {icon}
        {title}
      </h3>
      <div className="settings-grid">{children}</div>
    </section>
  );
}

function App() {
  const [video, setVideo] = React.useState<VideoRecord | null>(null);
  const [settings, setSettings] = React.useState<Settings>(initialSettings);
  const [job, setJob] = React.useState<Job | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [videoUrl, setVideoUrl] = React.useState("");
  const [importStatus, setImportStatus] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  const [activePreset, setActivePreset] = React.useState("Maximum Compatibility");
  const [syncPlayback, setSyncPlayback] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<"workflow" | "history">("workflow");
  const [activeView, setActiveView] = React.useState<"prepare" | "outputs" | "custom" | "compare" | "captions">(
    "prepare"
  );
  const [history, setHistory] = React.useState<HistorySnapshot>({ videos: [], jobs: [] });
  const [selectedVideoIds, setSelectedVideoIds] = React.useState<string[]>([]);
  const [selectedJobIds, setSelectedJobIds] = React.useState<string[]>([]);
  const [selectedPackageJobIds, setSelectedPackageJobIds] = React.useState<string[]>([]);
  const [sourceNameDraft, setSourceNameDraft] = React.useState("");
  const [renamingSource, setRenamingSource] = React.useState(false);
  const [jobNameDrafts, setJobNameDrafts] = React.useState<Record<string, string>>({});
  const [renamingJobId, setRenamingJobId] = React.useState<string | null>(null);
  const [packageMetadata, setPackageMetadata] = React.useState<PackageMetadata>({
    title: "",
    description: "",
    language: "en",
    filenamePrefix: ""
  });
  const [posterJob, setPosterJob] = React.useState<Job | null>(null);
  const [sampleJob, setSampleJob] = React.useState<Job | null>(null);
  const [packageJob, setPackageJob] = React.useState<Job | null>(null);
  const [subtitleJob, setSubtitleJob] = React.useState<Job | null>(null);
  const [muxJob, setMuxJob] = React.useState<Job | null>(null);
  const [activePosterPreview, setActivePosterPreview] = React.useState<Job | null>(null);
  const [posterZoom, setPosterZoom] = React.useState(1);
  const [posterPan, setPosterPan] = React.useState({ x: 0, y: 0 });
  const [posterDragStart, setPosterDragStart] = React.useState<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [editingSubtitleJob, setEditingSubtitleJob] = React.useState<Job | null>(null);
  const [subtitleDraft, setSubtitleDraft] = React.useState("");
  const [subtitlePreviewKey, setSubtitlePreviewKey] = React.useState(0);
  const [isSavingSubtitles, setIsSavingSubtitles] = React.useState(false);
  const [capabilities, setCapabilities] = React.useState<Capabilities | null>(null);
  const [posterTimestamp, setPosterTimestamp] = React.useState(0);
  const sourcePreviewRef = React.useRef<HTMLVideoElement | null>(null);
  const originalCompareRef = React.useRef<HTMLVideoElement | null>(null);
  const optimizedCompareRef = React.useRef<HTMLVideoElement | null>(null);
  const isSyncingRef = React.useRef(false);

  const sourceUrl = video ? `${apiBaseUrl}/api/videos/${video.id}/source` : "";
  const sourceDownloadUrl = video ? `${apiBaseUrl}/api/videos/${video.id}/download` : "";
  const outputUrl =
    job?.status === "completed" && (job.kind === "encode" || job.kind === "mux")
      ? `${apiBaseUrl}/api/jobs/${job.id}/output`
      : "";
  const downloadUrl = job?.status === "completed" ? `${apiBaseUrl}/api/jobs/${job.id}/download` : "";
  const posterUrl = posterJob?.status === "completed" ? `${apiBaseUrl}/api/jobs/${posterJob.id}/output` : "";
  const activePosterUrl =
    activePosterPreview?.status === "completed" ? `${apiBaseUrl}/api/jobs/${activePosterPreview.id}/output` : "";
  const estimate = video ? estimateOutputSize(video.metadata, settings) : undefined;
  const recommendations = video ? buildRecommendations(video.metadata, settings, estimate) : [];
  const videoMarkup = job ? buildVideoMarkup(job, job.settings) : "";
  const completedReduction =
    video && job?.outputSize ? Math.round((1 - job.outputSize / video.metadata.fileSize) * 100) : undefined;
  const completedEncodeJobs = video
    ? history.jobs.filter(
        (historyJob) =>
          historyJob.videoId === video.id &&
          (historyJob.kind === "encode" || historyJob.kind === "mux") &&
          historyJob.status === "completed"
      )
    : [];
  const hasModernExport = completedEncodeJobs.some(
    (historyJob) => historyJob.settings.outputContainer === "webm" || historyJob.settings.videoCodec !== "libx264"
  );
  const hasFallbackExport = completedEncodeJobs.some(
    (historyJob) => historyJob.settings.outputContainer === "mp4" && historyJob.settings.videoCodec === "libx264"
  );
  const hasPoster =
    posterJob?.status === "completed" ||
    (video
      ? history.jobs.some(
          (historyJob) =>
            historyJob.videoId === video.id && historyJob.kind === "poster" && historyJob.status === "completed"
        )
      : false);
  const hasCaptions =
    subtitleJob?.status === "completed" ||
    (video
      ? history.jobs.some(
          (historyJob) =>
            historyJob.videoId === video.id && historyJob.kind === "subtitle" && historyJob.status === "completed"
        )
      : false);
  const currentVideoJobs = React.useMemo(() => {
    if (!video) return [];
    const byId = new Map<string, Job>();
    for (const historyJob of history.jobs) {
      if (historyJob.videoId === video.id) byId.set(historyJob.id, historyJob);
    }
    for (const liveJob of [job, sampleJob, posterJob, packageJob, subtitleJob, muxJob]) {
      if (liveJob?.videoId === video.id) byId.set(liveJob.id, liveJob);
    }
    return Array.from(byId.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [history.jobs, job, muxJob, packageJob, posterJob, sampleJob, subtitleJob, video]);
  const packageCandidateJobs = currentVideoJobs.filter(
    (historyJob) =>
      historyJob.status === "completed" &&
      (historyJob.kind === "encode" ||
        historyJob.kind === "mux" ||
        historyJob.kind === "poster" ||
        historyJob.kind === "subtitle")
  );
  const explicitPackageSelection = selectedPackageJobIds.filter((jobId) =>
    packageCandidateJobs.some((historyJob) => historyJob.id === jobId)
  );
  const packageJobIds =
    explicitPackageSelection.length > 0
      ? explicitPackageSelection
      : packageCandidateJobs.map((historyJob) => historyJob.id);
  const bestSavingsJob = completedEncodeJobs
    .filter((historyJob) => historyJob.outputSize)
    .sort((a, b) => (a.outputSize ?? Infinity) - (b.outputSize ?? Infinity))[0];
  const runningJobs = currentVideoJobs.filter(
    (historyJob) => historyJob.status === "queued" || historyJob.status === "running"
  );
  const finishedOutputJobs = currentVideoJobs.filter(
    (historyJob) => historyJob.status !== "queued" && historyJob.status !== "running"
  );
  const completedOutputJobs = finishedOutputJobs.filter((historyJob) => historyJob.status === "completed");
  const selectedPackageJobs = packageCandidateJobs.filter((historyJob) => packageJobIds.includes(historyJob.id));
  const packagePreviewSize = selectedPackageJobs.reduce((sum, historyJob) => sum + (historyJob.outputSize ?? 0), 0);
  const packageSavings =
    video && packagePreviewSize > 0 ? Math.round((1 - packagePreviewSize / video.metadata.fileSize) * 100) : undefined;
  const packageMetadataReady = Boolean(
    packageMetadata.title.trim() &&
    packageMetadata.description.trim() &&
    packageMetadata.language.trim() &&
    packageMetadata.filenamePrefix.trim()
  );
  const currentStatus =
    runningJobs.length > 0
      ? `${runningJobs.length} running`
      : packageJob?.status === "completed"
        ? "Package ready"
        : completedOutputJobs.length > 0
          ? "Outputs ready"
          : video
            ? "Ready"
            : "No video";

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  React.useEffect(() => {
    if (!activePosterPreview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePosterLightbox();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePosterPreview]);

  React.useEffect(() => {
    void refreshHistory();
    void loadCapabilities();
  }, []);

  async function loadCapabilities() {
    const response = await fetch(`${apiBaseUrl}/api/capabilities`);
    if (!response.ok) return;
    setCapabilities((await response.json()) as Capabilities);
  }

  async function refreshHistory() {
    const response = await fetch(`${apiBaseUrl}/api/history`);
    if (!response.ok) return;
    setHistory((await response.json()) as HistorySnapshot);
  }

  function mergeHistoryJob(updated: Job) {
    setHistory((current) => {
      const jobsById = new Map(current.jobs.map((historyJob) => [historyJob.id, historyJob]));
      jobsById.set(updated.id, updated);
      return {
        ...current,
        jobs: Array.from(jobsById.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      };
    });
  }

  async function responseError(response: Response): Promise<string> {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { error?: string };
      return parsed.error ?? text;
    } catch {
      return text;
    }
  }

  function loadVideoRecord(record: VideoRecord) {
    setVideo(record);
    setSourceNameDraft(record.originalName);
    setActiveTab("workflow");
    setActiveView("prepare");
    setSettings((current) => ({
      ...current,
      outputFilename: `${record.originalName.replace(/\.[^.]+$/, "")}-optimized`
    }));
    setPackageMetadata({
      title: record.originalName.replace(/\.[^.]+$/, ""),
      description: `Video for ${record.originalName.replace(/\.[^.]+$/, "")}.`,
      language: "en",
      filenamePrefix: slugify(record.originalName.replace(/\.[^.]+$/, ""))
    });
  }

  function watchJob(nextJob: Job, onUpdate?: (updated: Job) => void) {
    const events = new EventSource(`${apiBaseUrl}/api/jobs/${nextJob.id}/events`);
    events.onmessage = (event) => {
      const updated = JSON.parse(event.data) as Job;
      mergeHistoryJob(updated);
      onUpdate?.(updated);
      if (updated.id === job?.id) setJob(updated);
      if (updated.id === subtitleJob?.id) setSubtitleJob(updated);
      if (updated.id === muxJob?.id) setMuxJob(updated);
      if (updated.status === "completed" || updated.status === "failed" || updated.status === "canceled") {
        events.close();
        void refreshHistory();
      }
    };
    events.onerror = () => {
      events.close();
      void refreshHistory();
    };
  }

  async function uploadFile(file: File) {
    setIsUploading(true);
    setImportStatus("Analyzing local file with FFprobe...");
    setError(null);
    setJob(null);
    setPosterJob(null);
    setSampleJob(null);
    setPackageJob(null);
    setSubtitleJob(null);
    setMuxJob(null);
    setEditingSubtitleJob(null);
    setSubtitleDraft("");
    setPosterTimestamp(0);

    try {
      const body = new FormData();
      body.append("video", file);
      const response = await fetch(`${apiBaseUrl}/api/videos`, { method: "POST", body });
      if (!response.ok) throw new Error(await response.text());
      const record = (await response.json()) as VideoRecord;
      loadVideoRecord(record);
      void refreshHistory();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setImportStatus("");
    }
  }

  function mergeHistoryVideo(updated: VideoRecord) {
    setHistory((current) => ({
      ...current,
      videos: current.videos.map((historyVideo) =>
        historyVideo.id === updated.id ? { ...historyVideo, ...updated, jobIds: historyVideo.jobIds } : historyVideo
      )
    }));
  }

  async function renameSource() {
    if (!video || !sourceNameDraft.trim()) return;
    setRenamingSource(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalName: sourceNameDraft.trim() })
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const updated = (await response.json()) as VideoRecord;
      setVideo(updated);
      setSourceNameDraft(updated.originalName);
      mergeHistoryVideo(updated);
      void refreshHistory();
    } finally {
      setRenamingSource(false);
    }
  }

  async function renameJobOutput(target: Job) {
    const nextName = (jobNameDrafts[target.id] ?? target.outputFileName ?? "").trim();
    if (!nextName) return;
    setRenamingJobId(target.id);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/jobs/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputFileName: nextName })
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const updated = (await response.json()) as Job;
      mergeHistoryJob(updated);
      if (updated.id === job?.id) setJob(updated);
      if (updated.id === sampleJob?.id) setSampleJob(updated);
      if (updated.id === posterJob?.id) setPosterJob(updated);
      if (updated.id === packageJob?.id) setPackageJob(updated);
      if (updated.id === subtitleJob?.id) setSubtitleJob(updated);
      if (updated.id === muxJob?.id) setMuxJob(updated);
      if (updated.id === editingSubtitleJob?.id) setEditingSubtitleJob(updated);
      setJobNameDrafts((current) => ({ ...current, [updated.id]: updated.outputFileName ?? nextName }));
      void refreshHistory();
    } finally {
      setRenamingJobId(null);
    }
  }

  async function importVideoUrl() {
    if (!videoUrl.trim()) return;
    setIsUploading(true);
    setImportStatus("Downloading with yt-dlp. This can take a minute for longer videos...");
    setError(null);
    setJob(null);
    setPosterJob(null);
    setSampleJob(null);
    setPackageJob(null);
    setSubtitleJob(null);
    setMuxJob(null);
    setPosterTimestamp(0);

    try {
      const response = await fetch(`${apiBaseUrl}/api/videos/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrl.trim() })
      });
      if (!response.ok) throw new Error(await responseError(response));
      setImportStatus("Download complete. Analyzing with FFprobe...");
      const record = (await response.json()) as VideoRecord;
      loadVideoRecord(record);
      setVideoUrl("");
      void refreshHistory();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "URL import failed");
    } finally {
      setIsUploading(false);
      setImportStatus("");
    }
  }

  function startNewVideo() {
    setVideo(null);
    setJob(null);
    setSampleJob(null);
    setPosterJob(null);
    setPackageJob(null);
    setSubtitleJob(null);
    setMuxJob(null);
    setEditingSubtitleJob(null);
    setActivePosterPreview(null);
    setSubtitleDraft("");
    setSourceNameDraft("");
    setPosterTimestamp(0);
    setSelectedPackageJobIds([]);
    setPackageMetadata({ title: "", description: "", language: "en", filenamePrefix: "" });
    setSettings(initialSettings);
    setError(null);
    setImportStatus("");
    setVideoUrl("");
    setActiveTab("workflow");
    setActiveView("prepare");
  }

  async function startJob() {
    if (!video) return;
    setError(null);
    const response = await fetch(`${apiBaseUrl}/api/videos/${video.id}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    if (!response.ok) {
      setError(await response.text());
      return;
    }

    const nextJob = (await response.json()) as Job;
    setJob(nextJob);
    setActiveView("outputs");
    watchJob(nextJob, setJob);
    void refreshHistory();
  }

  async function startSampleJob() {
    if (!video) return;
    setError(null);
    const response = await fetch(`${apiBaseUrl}/api/videos/${video.id}/sample`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, sampleSeconds: 5 })
    });
    if (!response.ok) {
      setError(await response.text());
      return;
    }
    const nextJob = (await response.json()) as Job;
    setSampleJob(nextJob);
    setActiveView("outputs");
    watchJob(nextJob, setSampleJob);
    void refreshHistory();
  }

  async function startPosterJob() {
    if (!video) return;
    setError(null);
    const atSeconds = Math.max(0, Math.min(posterTimestamp, Math.max(0, video.metadata.durationSeconds - 0.1)));
    const response = await fetch(`${apiBaseUrl}/api/videos/${video.id}/poster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ atSeconds })
    });
    if (!response.ok) {
      setError(await response.text());
      return;
    }
    const nextJob = (await response.json()) as Job;
    setPosterJob(nextJob);
    setActiveView("outputs");
    watchJob(nextJob, setPosterJob);
    void refreshHistory();
  }

  async function startSubtitleJob() {
    if (!video) return;
    setError(null);
    const response = await fetch(`${apiBaseUrl}/api/videos/${video.id}/subtitles`, { method: "POST" });
    if (!response.ok) {
      setError(await response.text());
      return;
    }
    const nextJob = (await response.json()) as Job;
    setSubtitleJob(nextJob);
    setActiveView("outputs");
    watchJob(nextJob, setSubtitleJob);
    void refreshHistory();
  }

  function useCurrentPreviewFrame() {
    const currentTime = sourcePreviewRef.current?.currentTime ?? 0;
    setPosterTimestamp(Math.round(currentTime * 10) / 10);
  }

  async function startPairJobs() {
    if (!video) return;
    setError(null);
    const response = await fetch(`${apiBaseUrl}/api/videos/${video.id}/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    if (!response.ok) {
      setError(await response.text());
      return;
    }
    const payload = (await response.json()) as { jobs: Job[] };
    const primary = payload.jobs[0];
    if (primary) setJob(primary);
    setActiveView("outputs");
    payload.jobs.forEach((nextJob) => watchJob(nextJob, primary?.id === nextJob.id ? setJob : undefined));
    void refreshHistory();
  }

  async function optimizeForWebsite() {
    if (!video) return;
    setError(null);
    await startPairJobs();
    if (posterJob?.status !== "running" && !hasPoster) {
      await startPosterJob();
    }
  }

  async function cancelJob(target: Job | null) {
    if (!target) return;
    const response = await fetch(`${apiBaseUrl}/api/jobs/${target.id}/cancel`, { method: "POST" });
    if (!response.ok) return;
    const updated = (await response.json()) as Job;
    if (updated.status === "canceled") {
      setHistory((current) => ({
        ...current,
        jobs: current.jobs.filter((historyJob) => historyJob.id !== updated.id)
      }));
      if (target.id === job?.id) setJob(null);
      if (target.id === sampleJob?.id) setSampleJob(null);
      if (target.id === posterJob?.id) setPosterJob(null);
      if (target.id === packageJob?.id) setPackageJob(null);
      if (target.id === subtitleJob?.id) setSubtitleJob(null);
      if (target.id === muxJob?.id) setMuxJob(null);
      void refreshHistory();
      return;
    }
    if (target.id === job?.id) setJob(updated);
    if (target.id === sampleJob?.id) setSampleJob(updated);
    if (target.id === posterJob?.id) setPosterJob(updated);
    if (target.id === packageJob?.id) setPackageJob(updated);
    if (target.id === subtitleJob?.id) setSubtitleJob(updated);
    if (target.id === muxJob?.id) setMuxJob(updated);
    void refreshHistory();
  }

  async function createWebPackage() {
    if (!video) return;
    setError(null);
    if (packageJobIds.length === 0) {
      setError("Create at least one completed export or poster before building a package.");
      return;
    }
    if (!packageMetadataReady) {
      setError("Add a video title, SEO description, language, and filename prefix before building the package.");
      return;
    }

    const response = await fetch(`${apiBaseUrl}/api/videos/${video.id}/package`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobIds: Array.from(new Set(packageJobIds)), metadata: packageMetadata })
    });
    if (!response.ok) {
      setError(await response.text());
      return;
    }
    const nextJob = (await response.json()) as Job;
    setPackageJob(nextJob);
    setActiveView("outputs");
    void refreshHistory();
  }

  async function deleteHistoryItems(videoIds = selectedVideoIds, jobIds = selectedJobIds) {
    const response = await fetch(`${apiBaseUrl}/api/history/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoIds, jobIds })
    });
    if (!response.ok) return;
    setHistory((await response.json()) as HistorySnapshot);
    setSelectedVideoIds([]);
    setSelectedJobIds([]);
    if (videoIds.includes(video?.id ?? "")) {
      setVideo(null);
      setJob(null);
      setSampleJob(null);
      setPosterJob(null);
      setPackageJob(null);
      setSubtitleJob(null);
      setMuxJob(null);
      setEditingSubtitleJob(null);
      closePosterLightbox();
    }
    if (jobIds.includes(job?.id ?? "")) {
      setJob(null);
    }
    if (jobIds.includes(sampleJob?.id ?? "")) {
      setSampleJob(null);
    }
    if (jobIds.includes(posterJob?.id ?? "")) {
      setPosterJob(null);
    }
    if (jobIds.includes(packageJob?.id ?? "")) {
      setPackageJob(null);
    }
    if (jobIds.includes(subtitleJob?.id ?? "")) {
      setSubtitleJob(null);
    }
    if (jobIds.includes(muxJob?.id ?? "")) {
      setMuxJob(null);
    }
    if (jobIds.includes(activePosterPreview?.id ?? "")) {
      closePosterLightbox();
    }
    if (jobIds.includes(editingSubtitleJob?.id ?? "")) {
      setEditingSubtitleJob(null);
      setSubtitleDraft("");
    }
  }

  function applyPreset(name: string) {
    setActivePreset(name);
    setSettings((current) => ({ ...current, ...presets[name] }));
  }

  function updateOutputContainer(outputContainer: Settings["outputContainer"]) {
    setSettings((current) => normalizeOutputContainerChange(current, outputContainer));
  }

  function updateVideoCodec(videoCodec: Settings["videoCodec"]) {
    setSettings((current) => normalizeVideoCodecChange(current, videoCodec));
  }

  function applyTargetSize(targetMb: number) {
    if (!video?.metadata.durationSeconds) return;
    const targetBitsPerSecond = (targetMb * 1024 * 1024 * 8) / video.metadata.durationSeconds;
    const hasAudio = video.metadata.trackCounts.audio > 0;
    const targetVideoBits = targetBitsPerSecond - (hasAudio ? 96_000 : 0);
    const aggressive = targetMb <= 2 || targetVideoBits < 800_000;
    const balanced = targetMb <= 5 || targetVideoBits < 1_600_000;

    setSettings((current) => ({
      ...current,
      width: aggressive ? 854 : balanced ? 1280 : Math.min(video.metadata.width ?? 1920, 1920),
      frameRate: aggressive || (video.metadata.frameRate ?? 0) > 30 ? 24 : current.frameRate,
      crf:
        current.videoCodec === "libx264"
          ? aggressive
            ? 30
            : balanced
              ? 27
              : 24
          : aggressive
            ? 38
            : balanced
              ? 34
              : 30,
      audioMode: hasAudio ? "compress" : "remove",
      audioBitrateKbps: aggressive ? 64 : balanced ? 96 : 128
    }));
  }

  function loadHistoryVideo(historyVideo: HistoryVideo) {
    setVideo(historyVideo);
    setSourceNameDraft(historyVideo.originalName);
    const latestEncode = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "encode"
    );
    const latestPoster = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "poster"
    );
    const latestSample = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "sample"
    );
    const latestPackage = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "package"
    );
    const latestSubtitle = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "subtitle"
    );
    const latestMux = history.jobs.find(
      (historyJob) => historyJob.videoId === historyVideo.id && historyJob.kind === "mux"
    );
    setJob(latestEncode ?? null);
    setPosterJob(latestPoster ?? null);
    setSampleJob(latestSample ?? null);
    setPackageJob(latestPackage ?? null);
    setSubtitleJob(latestSubtitle ?? null);
    setMuxJob(latestMux ?? null);
    setEditingSubtitleJob(null);
    setSubtitleDraft("");
    if (latestEncode?.settings) setSettings((current) => ({ ...current, ...latestEncode.settings }));
    setPackageMetadata({
      title: historyVideo.originalName.replace(/\.[^.]+$/, ""),
      description: `Video for ${historyVideo.originalName.replace(/\.[^.]+$/, "")}.`,
      language: "en",
      filenamePrefix: slugify(historyVideo.originalName.replace(/\.[^.]+$/, ""))
    });
    setActiveTab("workflow");
    setActiveView("prepare");
  }

  function toggleSelected(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function selectVariation(nextJob: Job) {
    if (nextJob.kind === "encode") setJob(nextJob);
    if (nextJob.kind === "sample") setSampleJob(nextJob);
    if (nextJob.kind === "poster") setPosterJob(nextJob);
    if (nextJob.kind === "package") setPackageJob(nextJob);
    if (nextJob.kind === "subtitle") setSubtitleJob(nextJob);
    if (nextJob.kind === "mux") setMuxJob(nextJob);
    if ((nextJob.kind === "encode" || nextJob.kind === "mux") && nextJob.status === "completed") {
      setJob(nextJob);
      setActiveView("compare");
    }
  }

  function openPosterLightbox(nextJob: Job) {
    setPosterJob(nextJob);
    setActivePosterPreview(nextJob);
    setPosterZoom(1);
    setPosterPan({ x: 0, y: 0 });
    setPosterDragStart(null);
  }

  function closePosterLightbox() {
    setActivePosterPreview(null);
    setPosterZoom(1);
    setPosterPan({ x: 0, y: 0 });
    setPosterDragStart(null);
  }

  function updatePosterZoom(nextZoom: number) {
    const zoom = Math.max(1, Math.min(4, Math.round(nextZoom * 10) / 10));
    setPosterZoom(zoom);
    if (zoom === 1) setPosterPan({ x: 0, y: 0 });
  }

  function startPosterPan(event: React.PointerEvent<HTMLDivElement>) {
    if (posterZoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPosterDragStart({ x: event.clientX, y: event.clientY, panX: posterPan.x, panY: posterPan.y });
  }

  function movePosterPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!posterDragStart || posterZoom <= 1) return;
    setPosterPan({
      x: posterDragStart.panX + event.clientX - posterDragStart.x,
      y: posterDragStart.panY + event.clientY - posterDragStart.y
    });
  }

  function stopPosterPan() {
    setPosterDragStart(null);
  }

  function variationLabel(nextJob: Job): string {
    if (nextJob.kind === "encode" || nextJob.kind === "mux")
      return `${nextJob.settings.outputContainer.toUpperCase()} / ${codecLabel(nextJob.settings.videoCodec)}`;
    if (nextJob.kind === "sample") return "Sample estimate";
    if (nextJob.kind === "poster") return "Poster image";
    if (nextJob.kind === "subtitle") return "WebVTT + SRT captions";
    return "Web package";
  }

  function jobTitle(nextJob: Job): string {
    if (
      nextJob.kind === "encode" &&
      nextJob.settings.outputContainer === "mp4" &&
      nextJob.settings.videoCodec === "libx264"
    )
      return "MP4 fallback";
    if (
      nextJob.kind === "encode" &&
      nextJob.settings.outputContainer === "webm" &&
      nextJob.settings.videoCodec === "libaom-av1"
    )
      return "Modern AV1";
    if (nextJob.kind === "encode" && nextJob.settings.outputContainer === "webm") return "Modern WebM";
    if (nextJob.kind === "encode" && nextJob.settings.videoCodec !== "libx264") return "Modern MP4";
    if (nextJob.kind === "encode") return "Custom export";
    if (nextJob.kind === "mux") return "Captioned video";
    if (nextJob.kind === "poster") return "WebP poster";
    if (nextJob.kind === "subtitle") return "Captions + transcript";
    if (nextJob.kind === "sample") return "5-second sample";
    return "Website package";
  }

  function packageItemClass(done: boolean) {
    return done ? "package-checklist-item good" : "package-checklist-item warn";
  }

  function variationDetails(nextJob: Job): string {
    if (nextJob.kind === "mux") return "Video output with an embedded subtitle track";
    if (nextJob.kind === "encode") {
      const dimensions = nextJob.settings.width ? `${nextJob.settings.width}px wide` : "source size";
      const frameRate = nextJob.settings.frameRate ? `${nextJob.settings.frameRate} fps` : "source fps";
      const audio =
        nextJob.settings.audioMode === "remove"
          ? "no audio"
          : `${nextJob.settings.audioCodec === "aac" ? "AAC" : "Opus"} audio`;
      return `${dimensions} / ${frameRate} / CRF ${nextJob.settings.crf} / ${audio}`;
    }
    if (nextJob.kind === "sample" && nextJob.sampleEstimate) {
      return `Projects ${formatBytes(nextJob.sampleEstimate.estimatedFullSize)} full-size output`;
    }
    if (nextJob.kind === "poster") return "Generated from the selected source frame";
    if (nextJob.kind === "subtitle") return "Generated captions for accessible web playback";
    return "ZIP bundle for website handoff";
  }

  function variationBadges(nextJob: Job): string[] {
    const badges: string[] = [];
    if (
      (nextJob.kind === "encode" || nextJob.kind === "mux") &&
      nextJob.settings.outputContainer === "mp4" &&
      nextJob.settings.videoCodec === "libx264"
    )
      badges.push("Best fallback");
    if (
      (nextJob.kind === "encode" || nextJob.kind === "mux") &&
      (nextJob.settings.outputContainer === "webm" || nextJob.settings.videoCodec !== "libx264")
    )
      badges.push("Modern source");
    if ((nextJob.kind === "encode" || nextJob.kind === "mux") && nextJob.settings.audioMode === "remove")
      badges.push("Silent loop ready");
    if (nextJob.kind === "mux") badges.push("Embedded captions");
    if (bestSavingsJob?.id === nextJob.id) badges.push("Smallest export");
    if (nextJob.kind === "poster") badges.push("SEO/helper asset");
    if (nextJob.kind === "subtitle") badges.push("Accessibility");
    if (nextJob.kind === "package") badges.push("Handoff ZIP");
    return badges;
  }

  function togglePackageJob(jobId: string) {
    const candidateIds = packageCandidateJobs.map((historyJob) => historyJob.id);
    setSelectedPackageJobIds((current) => {
      const active = current.length === 0 ? candidateIds : current;
      return active.includes(jobId) ? active.filter((id) => id !== jobId) : [...active, jobId];
    });
  }

  async function revealJobOutput(target: Job) {
    const response = await fetch(`${apiBaseUrl}/api/jobs/${target.id}/reveal`, { method: "POST" });
    if (!response.ok) setError(await response.text());
  }

  async function openSubtitleEditor(target: Job) {
    setError(null);
    const response = await fetch(`${apiBaseUrl}/api/jobs/${target.id}/captions`);
    if (!response.ok) {
      setError(await response.text());
      return;
    }
    const payload = (await response.json()) as { vtt: string };
    setEditingSubtitleJob(target);
    setSubtitleDraft(payload.vtt);
    setActiveView("captions");
  }

  async function saveSubtitleEdits() {
    if (!editingSubtitleJob) return;
    setError(null);
    setIsSavingSubtitles(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/jobs/${editingSubtitleJob.id}/captions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vtt: subtitleDraft })
      });
      if (!response.ok) {
        setError(await response.text());
        return;
      }
      const updated = (await response.json()) as Job;
      setSubtitleJob(updated);
      setEditingSubtitleJob(updated);
      setSubtitlePreviewKey((current) => current + 1);
      void refreshHistory();
    } finally {
      setIsSavingSubtitles(false);
    }
  }

  async function muxSubtitlesIntoVideo(target: Job) {
    const captions =
      subtitleJob?.status === "completed"
        ? subtitleJob
        : currentVideoJobs.find((historyJob) => historyJob.kind === "subtitle" && historyJob.status === "completed");
    if (!captions) {
      setError("Generate subtitles before embedding them into a video file.");
      return;
    }

    setError(null);
    const response = await fetch(`${apiBaseUrl}/api/jobs/${target.id}/mux-subtitles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtitleJobId: captions.id })
    });
    if (!response.ok) {
      setError(await response.text());
      return;
    }
    const nextJob = (await response.json()) as Job;
    setMuxJob(nextJob);
    setActiveView("outputs");
    watchJob(nextJob, setMuxJob);
    void refreshHistory();
  }

  function otherCompareVideo(source: "original" | "optimized"): HTMLVideoElement | null {
    return source === "original" ? optimizedCompareRef.current : originalCompareRef.current;
  }

  function syncVideoState(source: "original" | "optimized", action: "play" | "pause" | "seek" | "rate") {
    if (!syncPlayback || isSyncingRef.current) return;

    const sourceVideo = source === "original" ? originalCompareRef.current : optimizedCompareRef.current;
    const targetVideo = otherCompareVideo(source);
    if (!sourceVideo || !targetVideo) return;

    isSyncingRef.current = true;
    targetVideo.playbackRate = sourceVideo.playbackRate;

    if (Math.abs(targetVideo.currentTime - sourceVideo.currentTime) > 0.2) {
      targetVideo.currentTime = sourceVideo.currentTime;
    }

    if (action === "play") {
      void targetVideo.play().catch(() => undefined);
    }

    if (action === "pause") {
      targetVideo.pause();
    }

    window.setTimeout(() => {
      isSyncingRef.current = false;
    }, 120);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>Web Video Optimizer</strong>
            <span>Local FFmpeg workspace</span>
          </div>
        </div>

        <button className="button primary wide new-upload" type="button" onClick={startNewVideo}>
          <UploadCloud size={18} />
          New Video
        </button>

        <div className="sidebar-section">
          <div className="sidebar-section-title">
            <span>Library</span>
            <button className="mini-button" type="button" onClick={() => void refreshHistory()}>
              Refresh
            </button>
          </div>
          <div className="sidebar-list">
            {history.videos.length === 0 && <p className="sidebar-empty">No uploads yet.</p>}
            {history.videos.map((historyVideo) => (
              <button
                className={`sidebar-file ${video?.id === historyVideo.id ? "active" : ""}`}
                key={historyVideo.id}
                onClick={() => loadHistoryVideo(historyVideo)}
              >
                <FileVideo size={16} />
                <span>
                  <strong>{historyVideo.originalName}</strong>
                  <em>
                    {formatBytes(historyVideo.metadata.fileSize)} / {historyVideo.jobIds.length} outputs
                  </em>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <button
            className="utility-button wide"
            type="button"
            onClick={() => {
              setActiveTab(activeTab === "history" ? "workflow" : "history");
              void refreshHistory();
            }}
          >
            <History size={18} />
            {activeTab === "history" ? "Workflow" : "Manage Library"}
          </button>
          <button
            className="utility-button wide"
            type="button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="brand">
            <div>
              <p className="eyebrow">Local-first FFmpeg workflow</p>
              <h1>Web Video Optimizer</h1>
              <p className="subtitle">
                Upload a video, let the app recommend a web package, then fine-tune only when you need to.
              </p>
            </div>
          </div>
          <div className="top-actions">
            <div className={`status-pill ${runningJobs.length > 0 ? "running" : ""}`}>{currentStatus}</div>
            <div className="privacy">
              <ShieldCheck size={17} />
              Local only
            </div>
          </div>
        </header>

        {error && <div className="notice error global-error">{error}</div>}

        {activeTab === "workflow" && (
          <nav className="workflow" aria-label="Workspace views">
            <button
              className={`workflow-step ${activeView === "prepare" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveView("prepare")}
            >
              <UploadCloud size={17} />
              Prepare
            </button>
            <button
              className={`workflow-step ${activeView === "outputs" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveView("outputs")}
              disabled={!video}
            >
              <Package size={17} />
              Jobs & Outputs
              {currentVideoJobs.length > 0 && <span>{currentVideoJobs.length}</span>}
            </button>
            <button
              className={`workflow-step ${activeView === "custom" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveView("custom")}
              disabled={!video}
            >
              <Settings2 size={17} />
              Custom
            </button>
          </nav>
        )}

        {activeTab === "history" && (
          <section className="workflow-section">
            <SectionHeader
              icon={<History size={21} />}
              title="History"
              kicker="Bring back previous uploads and outputs from this app session, or clean them up individually or in bulk."
            />
            <div className="history-actions">
              <button className="button secondary" onClick={() => void refreshHistory()}>
                Refresh
              </button>
              <button
                className="button secondary"
                disabled={selectedVideoIds.length + selectedJobIds.length === 0}
                onClick={() => void deleteHistoryItems()}
              >
                <Trash2 size={18} />
                Delete Selected
              </button>
            </div>
            <div className="history-layout">
              <div className="panel">
                <SectionHeader icon={<FileVideo size={20} />} title="Uploaded Files" />
                <div className="history-list">
                  {history.videos.length === 0 && <p className="muted">No uploaded files yet.</p>}
                  {history.videos.map((historyVideo) => (
                    <div className="history-item" key={historyVideo.id}>
                      <input
                        type="checkbox"
                        checked={selectedVideoIds.includes(historyVideo.id)}
                        onChange={() => setSelectedVideoIds((current) => toggleSelected(current, historyVideo.id))}
                      />
                      <button className="history-main" onClick={() => loadHistoryVideo(historyVideo)}>
                        <strong>{historyVideo.originalName}</strong>
                        <span>
                          {formatBytes(historyVideo.metadata.fileSize)} /{" "}
                          {formatDuration(historyVideo.metadata.durationSeconds)} / {historyVideo.jobIds.length} jobs
                        </span>
                      </button>
                      <button
                        className="icon-button danger-button"
                        onClick={() => void deleteHistoryItems([historyVideo.id], [])}
                        aria-label="Delete file"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel">
                <SectionHeader icon={<Package size={20} />} title="Jobs & Outputs" />
                <div className="history-list">
                  {history.jobs.length === 0 && <p className="muted">No jobs yet.</p>}
                  {history.jobs.map((historyJob) => (
                    <div className="history-item" key={historyJob.id}>
                      <input
                        type="checkbox"
                        checked={selectedJobIds.includes(historyJob.id)}
                        onChange={() => setSelectedJobIds((current) => toggleSelected(current, historyJob.id))}
                      />
                      <button
                        className="history-main"
                        onClick={() => {
                          const owningVideo = history.videos.find(
                            (historyVideo) => historyVideo.id === historyJob.videoId
                          );
                          if (owningVideo) loadHistoryVideo(owningVideo);
                          setJob(historyJob.kind === "encode" ? historyJob : job);
                          setSampleJob(historyJob.kind === "sample" ? historyJob : sampleJob);
                          setPosterJob(historyJob.kind === "poster" ? historyJob : posterJob);
                          setPackageJob(historyJob.kind === "package" ? historyJob : packageJob);
                          setSubtitleJob(historyJob.kind === "subtitle" ? historyJob : subtitleJob);
                          setMuxJob(historyJob.kind === "mux" ? historyJob : muxJob);
                        }}
                      >
                        <strong>{historyJob.outputFileName ?? historyJob.id}</strong>
                        <span>
                          {historyJob.kind} / {historyJob.status} / {formatBytes(historyJob.outputSize)}
                        </span>
                      </button>
                      {historyJob.status === "running" && (
                        <button className="button secondary" onClick={() => void cancelJob(historyJob)}>
                          Cancel
                        </button>
                      )}
                      <button
                        className="icon-button danger-button"
                        onClick={() => void deleteHistoryItems([], [historyJob.id])}
                        aria-label="Delete job"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "workflow" && (
          <>
            {activeView === "prepare" && (
              <section className="workflow-section" id="upload">
                <SectionHeader
                  icon={<UploadCloud size={21} />}
                  title="Upload & Inspect"
                  kicker="Start with a local source file. The app analyzes it with FFprobe and keeps everything on this machine."
                />
                <div className="assistant-card">
                  <div className="assistant-avatar">
                    <Sparkles size={19} />
                  </div>
                  <div className="assistant-message">
                    <strong>
                      {video ? `I inspected ${video.originalName}.` : "Drop in a video and I will prep it for the web."}
                    </strong>
                    <p>
                      {video
                        ? `Source is ${formatBytes(video.metadata.fileSize)}, ${formatDuration(video.metadata.durationSeconds)}, ${video.metadata.width ?? "unknown"} x ${video.metadata.height ?? "unknown"}. Recommended path: create an MP4 fallback, a modern WebM source, and a WebP poster image.`
                        : "The simplest path is one button: upload, optimize for website delivery, compare, then download a package."}
                    </p>
                    <div className="actions">
                      <button
                        className="button primary"
                        onClick={optimizeForWebsite}
                        disabled={!video || job?.status === "running" || posterJob?.status === "running"}
                      >
                        <Wand2 size={18} />
                        Optimize For Website
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => setActiveView("custom")}
                        disabled={!video}
                      >
                        <Settings2 size={18} />
                        Choose Custom Export
                      </button>
                      {video && (
                        <button className="button secondary" type="button" onClick={() => setActiveView("outputs")}>
                          <Package size={18} />
                          View Jobs & Outputs
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="upload-layout">
                  <div
                    className="dropzone"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const file = event.dataTransfer.files[0];
                      if (file) uploadFile(file);
                    }}
                  >
                    {video ? (
                      <div className="upload-preview">
                        <video
                          controls
                          ref={sourcePreviewRef}
                          src={sourceUrl}
                          onTimeUpdate={(event) =>
                            setPosterTimestamp(Math.round(event.currentTarget.currentTime * 10) / 10)
                          }
                        />
                        <div className="preview-meta">
                          <div className="name-editor source-name-editor">
                            <input
                              value={sourceNameDraft}
                              onChange={(event) => setSourceNameDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void renameSource();
                              }}
                              aria-label="Source filename"
                            />
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() => void renameSource()}
                              disabled={renamingSource || sourceNameDraft.trim() === video.originalName}
                            >
                              <Save size={16} />
                              Save
                            </button>
                          </div>
                          <p>
                            {formatBytes(video.metadata.fileSize)} / {formatDuration(video.metadata.durationSeconds)} /{" "}
                            {video.metadata.width} x {video.metadata.height}
                          </p>
                        </div>
                        <div className="poster-picker">
                          <div>
                            <strong>Poster frame</strong>
                            <span>{formatDuration(posterTimestamp)} selected</span>
                          </div>
                          <a className="button secondary" href={sourceDownloadUrl}>
                            <Download size={18} />
                            Source
                          </a>
                          <button className="button secondary" onClick={useCurrentPreviewFrame}>
                            <Image size={18} />
                            Use Current Frame
                          </button>
                          <button
                            className="button secondary"
                            onClick={startPosterJob}
                            disabled={posterJob?.status === "running"}
                          >
                            Generate Poster
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="upload-icon">
                          <UploadCloud size={34} />
                        </div>
                        <h2>Drop a video file</h2>
                        <p>
                          {isUploading
                            ? importStatus || "Importing and analyzing video..."
                            : "Choose a file, drag one here, or import a permitted YouTube video."}
                        </p>
                      </>
                    )}
                    <label className="button secondary">
                      {video ? "Replace Video" : "Select Video"}
                      <input
                        type="file"
                        accept="video/*"
                        onChange={(event) => event.target.files?.[0] && uploadFile(event.target.files[0])}
                      />
                    </label>
                    <div className="url-import">
                      <span>Import from YouTube</span>
                      <div>
                        <input
                          type="url"
                          value={videoUrl}
                          placeholder="https://www.youtube.com/watch?v=..."
                          disabled={isUploading || capabilities?.ytDlp === false}
                          onChange={(event) => setVideoUrl(event.target.value)}
                        />
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => void importVideoUrl()}
                          disabled={isUploading || !videoUrl.trim() || capabilities?.ytDlp === false}
                        >
                          Import URL
                        </button>
                      </div>
                      <em>
                        {isUploading && importStatus
                          ? importStatus
                          : capabilities?.ytDlp === false
                            ? "Install yt-dlp or set YT_DLP_BIN to enable URL imports."
                            : "Use this only for videos you own or have permission to download."}
                      </em>
                    </div>
                  </div>

                  {video ? (
                    <div className="panel">
                      <SectionHeader icon={<FileVideo size={20} />} title="Source Details" />
                      <div className="metric-strip">
                        <div>
                          <span>Name</span>
                          <strong>{video.originalName}</strong>
                        </div>
                        <div>
                          <span>Source</span>
                          <strong>{formatBytes(video.metadata.fileSize)}</strong>
                        </div>
                        <div>
                          <span>Duration</span>
                          <strong>{formatDuration(video.metadata.durationSeconds)}</strong>
                        </div>
                        <div>
                          <span>Bitrate</span>
                          <strong>{formatBitrate(video.metadata.overallBitrate)}</strong>
                        </div>
                      </div>
                      <div className={video.metadata.webFriendly ? "notice good" : "notice warn"}>
                        {video.metadata.webFriendly ? "Looks web-friendly." : "Compatibility review recommended."}
                      </div>
                      <a className="button secondary wide" href={sourceDownloadUrl}>
                        <Download size={18} />
                        Download Original Source
                      </a>
                      {video.metadata.warnings.map((warning) => (
                        <div className="notice warn" key={warning}>
                          {warning}
                        </div>
                      ))}
                      <div className="subtitle-status">
                        <div>
                          <Captions size={20} />
                          <span>
                            <strong>Subtitles</strong>
                            <em>
                              {video.metadata.trackCounts.subtitle > 0
                                ? `${video.metadata.trackCounts.subtitle} embedded subtitle track${video.metadata.trackCounts.subtitle === 1 ? "" : "s"} found`
                                : video.metadata.trackCounts.audio === 0
                                  ? "No audio track found"
                                  : capabilities?.whisperCpp && capabilities?.whisperModel
                                    ? "No embedded subtitles. Ready to generate captions locally."
                                    : "No embedded subtitles. Configure whisper.cpp to generate captions."}
                            </em>
                          </span>
                        </div>
                        <button
                          className="button secondary"
                          onClick={startSubtitleJob}
                          disabled={
                            video.metadata.trackCounts.audio === 0 ||
                            subtitleJob?.status === "running" ||
                            !capabilities?.whisperCpp ||
                            !capabilities?.whisperModel
                          }
                        >
                          <Captions size={18} />
                          {subtitleJob?.status === "running" ? "Generating..." : "Generate Subtitles"}
                        </button>
                      </div>
                      {capabilities &&
                        (!capabilities.whisperCpp || !capabilities.whisperModel) &&
                        video.metadata.trackCounts.audio > 0 && (
                          <div className="notice info">
                            Subtitle generation needs whisper.cpp and a model. Set WHISPER_CPP_BIN and WHISPER_CPP_MODEL
                            before starting the API.
                          </div>
                        )}
                      <details className="details-panel">
                        <summary>Technical details</summary>
                        <div className="fields">
                          <Field label="Container" value={video.metadata.container} />
                          <Field label="Video codec" value={video.metadata.videoCodec} />
                          <Field label="Audio codec" value={video.metadata.audioCodec} />
                          <Field
                            label="Resolution"
                            value={
                              video.metadata.width && video.metadata.height
                                ? `${video.metadata.width} x ${video.metadata.height}`
                                : undefined
                            }
                          />
                          <Field
                            label="Frame rate"
                            value={video.metadata.frameRate ? `${video.metadata.frameRate} fps` : undefined}
                          />
                          <Field label="Video bitrate" value={formatBitrate(video.metadata.videoBitrate)} />
                          <Field label="Audio bitrate" value={formatBitrate(video.metadata.audioBitrate)} />
                          <Field label="Pixel format" value={video.metadata.pixelFormat} />
                          <Field
                            label="Audio sample rate"
                            value={video.metadata.audioSampleRate ? `${video.metadata.audioSampleRate} Hz` : undefined}
                          />
                          <Field
                            label="Tracks"
                            value={`${video.metadata.trackCounts.video} video, ${video.metadata.trackCounts.audio} audio, ${video.metadata.trackCounts.subtitle} subtitle`}
                          />
                        </div>
                      </details>
                    </div>
                  ) : (
                    <div className="panel empty-panel">
                      <SectionHeader icon={<Gauge size={20} />} title="Waiting For A Source" />
                      <p className="muted">
                        After upload, this panel will show codecs, bitrate, dimensions, track counts, compatibility
                        notes, and web-delivery warnings.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {video && activeView === "outputs" && (
              <section className="workflow-section" id="variations">
                <SectionHeader
                  icon={<Package size={21} />}
                  title="Jobs & Outputs"
                  kicker="Watch active work, review finished files, and build a website-ready package."
                />
                <div className="outputs-layout">
                  <div className="outputs-main">
                    <section className="panel job-queue">
                      <SectionHeader icon={<Gauge size={20} />} title="Current Jobs" />
                      {runningJobs.length === 0 ? (
                        <p className="muted">
                          No jobs running. Start the recommended website package or create a custom export.
                        </p>
                      ) : (
                        <div className="job-list">
                          {runningJobs.map((runningJob) => (
                            <div className="job-row" key={runningJob.id}>
                              <div>
                                <strong>{jobTitle(runningJob)}</strong>
                                <span>{runningJob.message ?? runningJob.status}</span>
                              </div>
                              <progress value={runningJob.progress} max="100" />
                              <button className="button secondary" onClick={() => void cancelJob(runningJob)}>
                                Cancel
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="output-cards">
                      {finishedOutputJobs.length === 0 ? (
                        <div className="panel empty-panel">
                          <SectionHeader icon={<Package size={20} />} title="No Outputs Yet" />
                          <p className="muted">
                            Use Optimize For Website to create an MP4 fallback, modern video, and poster, or go to
                            Custom for manual settings.
                          </p>
                          <div className="actions">
                            <button className="button primary" onClick={optimizeForWebsite}>
                              <Wand2 size={18} />
                              Optimize For Website
                            </button>
                            <button className="button secondary" onClick={() => setActiveView("custom")}>
                              <Settings2 size={18} />
                              Custom Export
                            </button>
                          </div>
                        </div>
                      ) : (
                        finishedOutputJobs.map((output) => {
                          const canInclude =
                            output.status === "completed" &&
                            (output.kind === "encode" ||
                              output.kind === "mux" ||
                              output.kind === "poster" ||
                              output.kind === "subtitle");
                          const packageChecked =
                            canInclude &&
                            packageCandidateJobs.length > 0 &&
                            (selectedPackageJobIds.length === 0 ? true : selectedPackageJobIds.includes(output.id));
                          const failed = output.status === "failed" || output.status === "canceled";
                          return (
                            <article
                              className={`output-card ${failed ? "failed" : ""} ${output.id === job?.id || output.id === posterJob?.id || output.id === packageJob?.id || output.id === subtitleJob?.id || output.id === muxJob?.id ? "active" : ""}`}
                              key={output.id}
                            >
                              <div className="output-card-main">
                                <span className="output-kind">{jobTitle(output)}</span>
                                {output.outputFileName ? (
                                  <div className="name-editor output-name-editor">
                                    <input
                                      value={jobNameDrafts[output.id] ?? output.outputFileName}
                                      onChange={(event) =>
                                        setJobNameDrafts((current) => ({ ...current, [output.id]: event.target.value }))
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") void renameJobOutput(output);
                                      }}
                                      aria-label={`Filename for ${output.outputFileName}`}
                                    />
                                    <button
                                      className="icon-button"
                                      type="button"
                                      onClick={() => void renameJobOutput(output)}
                                      disabled={
                                        renamingJobId === output.id ||
                                        (jobNameDrafts[output.id] ?? output.outputFileName).trim() ===
                                          output.outputFileName
                                      }
                                      aria-label="Save output filename"
                                    >
                                      <Save size={15} />
                                    </button>
                                  </div>
                                ) : (
                                  <h3>{output.id}</h3>
                                )}
                                <p>{failed ? (output.message ?? output.status) : variationDetails(output)}</p>
                                {output.status === "completed" && output.kind === "poster" && (
                                  <button
                                    className="poster-thumb"
                                    type="button"
                                    onClick={() => openPosterLightbox(output)}
                                  >
                                    <img
                                      src={`${apiBaseUrl}/api/jobs/${output.id}/output`}
                                      alt={`${output.outputFileName ?? "Generated poster"} preview`}
                                    />
                                    <span>Preview poster</span>
                                  </button>
                                )}
                                <div className="badge-row">
                                  {failed ? (
                                    <b>{output.status}</b>
                                  ) : (
                                    variationBadges(output).map((badge) => <b key={badge}>{badge}</b>)
                                  )}
                                </div>
                              </div>
                              <div className="output-card-stats">
                                <Field label="Status" value={output.status} />
                                <Field label="Size" value={formatBytes(output.outputSize)} />
                              </div>
                              <div className="output-card-actions">
                                {canInclude && (
                                  <label className="package-check">
                                    <input
                                      type="checkbox"
                                      checked={packageChecked}
                                      onChange={() => togglePackageJob(output.id)}
                                    />
                                    Use in package
                                  </label>
                                )}
                                {output.status === "completed" &&
                                  (output.kind === "encode" || output.kind === "mux") && (
                                    <button className="button secondary" onClick={() => selectVariation(output)}>
                                      <Layers size={17} />
                                      Compare
                                    </button>
                                  )}
                                {output.status === "completed" &&
                                  (output.kind === "encode" || output.kind === "mux") &&
                                  hasCaptions && (
                                    <button
                                      className="button secondary"
                                      onClick={() => void muxSubtitlesIntoVideo(output)}
                                    >
                                      <Captions size={17} />
                                      Embed Captions
                                    </button>
                                  )}
                                {output.status === "completed" && (
                                  <>
                                    {output.kind === "poster" && (
                                      <button className="button secondary" onClick={() => openPosterLightbox(output)}>
                                        <Image size={17} />
                                        Preview
                                      </button>
                                    )}
                                    {output.kind === "subtitle" && (
                                      <button
                                        className="button secondary"
                                        onClick={() => void openSubtitleEditor(output)}
                                      >
                                        <Edit3 size={17} />
                                        Edit
                                      </button>
                                    )}
                                    <a
                                      className="button secondary"
                                      href={`${apiBaseUrl}/api/jobs/${output.id}/download`}
                                    >
                                      <Download size={17} />
                                      {output.kind === "subtitle" ? "VTT" : "Download"}
                                    </a>
                                    {output.kind === "subtitle" && output.sidecarFileName && (
                                      <a
                                        className="button secondary"
                                        href={`${apiBaseUrl}/api/jobs/${output.id}/sidecar`}
                                      >
                                        <Download size={17} />
                                        SRT
                                      </a>
                                    )}
                                    <button className="button secondary" onClick={() => void revealJobOutput(output)}>
                                      <FolderOpen size={17} />
                                      Folder
                                    </button>
                                  </>
                                )}
                                {failed && output.ffmpegCommand && (
                                  <button
                                    className="button secondary"
                                    onClick={() => navigator.clipboard.writeText(output.ffmpegCommand)}
                                  >
                                    <Copy size={17} />
                                    Copy Command
                                  </button>
                                )}
                                <button
                                  className="icon-button danger-button"
                                  onClick={() => void deleteHistoryItems([], [output.id])}
                                  aria-label="Delete output"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </section>
                  </div>

                  <aside className="panel package-panel">
                    <SectionHeader
                      icon={<CheckCircle2 size={20} />}
                      title="Website Package"
                      kicker="Everything needed to drop the video into a site."
                    />
                    <div className="package-checklist">
                      <div className={packageItemClass(hasFallbackExport)}>
                        <CheckCircle2 size={17} />
                        <span>MP4 fallback</span>
                      </div>
                      <div className={packageItemClass(hasModernExport)}>
                        <CheckCircle2 size={17} />
                        <span>Modern WebM/AV1</span>
                      </div>
                      <div className={packageItemClass(hasPoster)}>
                        <CheckCircle2 size={17} />
                        <span>Poster image</span>
                      </div>
                      <div className={packageItemClass(hasCaptions)}>
                        <CheckCircle2 size={17} />
                        <span>Captions VTT/SRT</span>
                      </div>
                      <div className={packageItemClass(hasCaptions)}>
                        <CheckCircle2 size={17} />
                        <span>Transcript</span>
                      </div>
                      <div className={packageItemClass(packageMetadataReady)}>
                        <CheckCircle2 size={17} />
                        <span>SEO metadata</span>
                      </div>
                      <div className={packageItemClass(packageJob?.status === "completed")}>
                        <CheckCircle2 size={17} />
                        <span>Package ZIP</span>
                      </div>
                    </div>
                    {posterUrl && (
                      <div className="poster-preview">
                        <div>
                          <strong>Poster preview</strong>
                          <span>{posterJob?.outputFileName ?? "Generated WebP poster"}</span>
                        </div>
                        <img src={posterUrl} alt={posterJob?.outputFileName ?? "Generated poster preview"} />
                      </div>
                    )}
                    <div className="package-meta-form">
                      <label>
                        <span>Video title</span>
                        <input
                          value={packageMetadata.title}
                          onChange={(event) => setPackageMetadata({ ...packageMetadata, title: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>SEO description</span>
                        <textarea
                          value={packageMetadata.description}
                          onChange={(event) =>
                            setPackageMetadata({ ...packageMetadata, description: event.target.value })
                          }
                        />
                      </label>
                      <div className="package-meta-row">
                        <label>
                          <span>Language</span>
                          <input
                            value={packageMetadata.language}
                            onChange={(event) =>
                              setPackageMetadata({ ...packageMetadata, language: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>Filename prefix</span>
                          <input
                            value={packageMetadata.filenamePrefix}
                            onChange={(event) =>
                              setPackageMetadata({ ...packageMetadata, filenamePrefix: slugify(event.target.value) })
                            }
                          />
                        </label>
                      </div>
                    </div>
                    <div className="package-files">
                      <strong>
                        {packageJobIds.length} selected output{packageJobIds.length === 1 ? "" : "s"}
                      </strong>
                      <span>
                        Original {formatBytes(video.metadata.fileSize)} / package media{" "}
                        {formatBytes(packagePreviewSize)}
                        {packageSavings !== undefined ? ` / ${packageSavings}% smaller` : ""}. Includes selected videos,
                        poster, captions, transcript, embed markup, and notes.
                      </span>
                      {selectedPackageJobs.length > 0 && (
                        <ul className="package-preview-list">
                          {selectedPackageJobs.map((selectedJob) => (
                            <li key={selectedJob.id}>{selectedJob.outputFileName ?? selectedJob.id}</li>
                          ))}
                          <li>embed.html</li>
                          <li>README.txt</li>
                        </ul>
                      )}
                    </div>
                    <button
                      className="button primary wide"
                      onClick={createWebPackage}
                      disabled={packageJobIds.length === 0 || !packageMetadataReady}
                    >
                      <Package size={18} />
                      Build Download Package
                    </button>
                    {packageJob?.status === "completed" && (
                      <div className="package-actions">
                        <a className="button secondary wide" href={`${apiBaseUrl}/api/jobs/${packageJob.id}/download`}>
                          <Download size={18} />
                          Download ZIP
                        </a>
                        <button className="button secondary wide" onClick={() => void revealJobOutput(packageJob)}>
                          <FolderOpen size={18} />
                          Show In Folder
                        </button>
                      </div>
                    )}
                  </aside>
                </div>
              </section>
            )}

            {video && activeView === "custom" && (
              <section className="workflow-section custom-view" id="export">
                <SectionHeader
                  icon={<Settings2 size={21} />}
                  title="Custom Export"
                  kicker="Manual presets and FFmpeg-style settings for one-off variations."
                />
                <div className="export-layout">
                  <div className="export-main">
                    <div className="panel preset-panel">
                      <SectionHeader
                        icon={<Wand2 size={20} />}
                        title="Choose Intent"
                        kicker="Start from a sensible export goal, then adjust details below."
                      />
                      <div className="preset-cards">
                        {Object.entries(presetInfo).map(([name, info]) => (
                          <button
                            className={`preset-card ${activePreset === name ? "active" : ""}`}
                            key={name}
                            onClick={() => applyPreset(name)}
                          >
                            <span className="preset-icon">{info.icon}</span>
                            <span>
                              <strong>{name}</strong>
                              <em>{info.label}</em>
                            </span>
                            <p>{info.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="panel target-size-panel">
                      <SectionHeader
                        icon={<Gauge size={20} />}
                        title="Target Size"
                        kicker="Pick a rough web budget and the app will adjust width, frame rate, CRF, and audio."
                      />
                      <div className="target-size-grid">
                        {[2, 5, 10].map((targetMb) => (
                          <button
                            className="target-size-button"
                            key={targetMb}
                            onClick={() => applyTargetSize(targetMb)}
                          >
                            <strong>Under {targetMb} MB</strong>
                            <span>
                              {targetMb === 2 ? "Tiny embeds" : targetMb === 5 ? "Marketing pages" : "Higher quality"}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="panel settings-panel">
                      <SectionHeader
                        icon={<Settings2 size={20} />}
                        title="Advanced Settings"
                        kicker="Grouped so the common decisions stay easy to scan."
                      />

                      <SettingsGroup icon={<Package size={18} />} title="Output">
                        <label>
                          <Label help="The downloaded file name. The extension is picked from the selected output format.">
                            Filename
                          </Label>
                          <input
                            value={settings.outputFilename}
                            onChange={(event) => setSettings({ ...settings, outputFilename: event.target.value })}
                          />
                        </label>
                        <label>
                          <Label help="MP4 is the safest fallback. WebM is great for modern browsers, especially with AV1 or VP9.">
                            File format
                          </Label>
                          <select
                            value={settings.outputContainer}
                            onChange={(event) =>
                              updateOutputContainer(event.target.value as Settings["outputContainer"])
                            }
                          >
                            <option value="mp4">MP4</option>
                            <option value="webm">WebM</option>
                          </select>
                        </label>
                      </SettingsGroup>

                      <SettingsGroup icon={<FileVideo size={18} />} title="Video">
                        <label>
                          <Label help="H.264 is the compatibility workhorse. AV1 usually compresses smaller but encodes much slower. VP9 is a solid WebM fallback.">
                            Video codec
                          </Label>
                          <select
                            value={settings.videoCodec}
                            onChange={(event) => updateVideoCodec(event.target.value as Settings["videoCodec"])}
                          >
                            <option value="libx264">H.264 / libx264</option>
                            <option value="libaom-av1">AV1 / libaom-av1</option>
                            <option value="libvpx-vp9">VP9 / libvpx-vp9</option>
                          </select>
                        </label>
                        <label>
                          <Label help="Set a target width while preserving aspect ratio. Leave blank to keep the source size.">
                            Width
                          </Label>
                          <input
                            type="number"
                            min="240"
                            value={settings.width ?? ""}
                            placeholder="Keep source"
                            onChange={(event) =>
                              setSettings({
                                ...settings,
                                width: event.target.value ? Number(event.target.value) : undefined
                              })
                            }
                          />
                        </label>
                        <label>
                          <Label help="Lowering 30 or 60 fps sources to 24 fps can help background and marketing videos shrink. Leave blank to keep source fps.">
                            Frame rate
                          </Label>
                          <input
                            type="number"
                            min="1"
                            value={settings.frameRate ?? ""}
                            placeholder="Keep source"
                            onChange={(event) =>
                              setSettings({
                                ...settings,
                                frameRate: event.target.value ? Number(event.target.value) : undefined
                              })
                            }
                          />
                        </label>
                        <label>
                          <Label help="Constant quality mode. Lower means larger/better; higher means smaller/more compressed. H.264 often likes 20-26, AV1 often likes 30-38.">
                            CRF: {settings.crf} ({qualityLabel(settings)})
                          </Label>
                          <input
                            type="range"
                            min="16"
                            max="40"
                            value={settings.crf}
                            onChange={(event) => setSettings({ ...settings, crf: Number(event.target.value) })}
                          />
                        </label>
                        <label>
                          <Label help="For H.264, slower presets spend more CPU to find smaller files at the same CRF.">
                            H.264 preset
                          </Label>
                          <select
                            value={settings.preset}
                            onChange={(event) =>
                              setSettings({ ...settings, preset: event.target.value as Settings["preset"] })
                            }
                          >
                            <option value="veryfast">Very fast</option>
                            <option value="fast">Fast</option>
                            <option value="medium">Medium</option>
                            <option value="slow">Slow</option>
                          </select>
                        </label>
                      </SettingsGroup>

                      <SettingsGroup icon={<Volume2 size={18} />} title="Audio">
                        <label>
                          <Label help="Remove audio for silent loops, compress it for normal web video, or keep the source audio settings.">
                            Audio mode
                          </Label>
                          <select
                            value={settings.audioMode}
                            onChange={(event) =>
                              setSettings({ ...settings, audioMode: event.target.value as Settings["audioMode"] })
                            }
                          >
                            <option value="keep">Keep</option>
                            <option value="compress">Compress</option>
                            <option value="remove">Remove</option>
                          </select>
                        </label>
                        <label>
                          <Label help="128-160 kbps is common for AAC web video. 64-96 kbps is often fine for Opus or simple speech/music.">
                            Audio codec
                          </Label>
                          <select
                            value={settings.audioCodec}
                            disabled={settings.audioMode === "remove"}
                            onChange={(event) =>
                              setSettings({ ...settings, audioCodec: event.target.value as Settings["audioCodec"] })
                            }
                          >
                            <option value="aac">AAC</option>
                            <option value="libopus">Opus</option>
                          </select>
                        </label>
                        <label>
                          <Label help="Target audio bitrate in kbps when audio is compressed.">Audio bitrate</Label>
                          <input
                            type="number"
                            min="32"
                            step="16"
                            value={settings.audioBitrateKbps}
                            disabled={settings.audioMode === "remove"}
                            onChange={(event) =>
                              setSettings({ ...settings, audioBitrateKbps: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label>
                          <Label help="48000 Hz is the normal video sample rate and a good default for website exports.">
                            Sample rate
                          </Label>
                          <input
                            type="number"
                            min="8000"
                            step="1000"
                            value={settings.audioSampleRate ?? ""}
                            disabled={settings.audioMode === "remove"}
                            placeholder="Keep source"
                            onChange={(event) =>
                              setSettings({
                                ...settings,
                                audioSampleRate: event.target.value ? Number(event.target.value) : undefined
                              })
                            }
                          />
                        </label>
                        <label>
                          <Label help="Use 2 channels for stereo web exports. Leave blank to keep the source channel layout.">
                            Channels
                          </Label>
                          <input
                            type="number"
                            min="1"
                            max="8"
                            value={settings.audioChannels ?? ""}
                            disabled={settings.audioMode === "remove"}
                            placeholder="Keep source"
                            onChange={(event) =>
                              setSettings({
                                ...settings,
                                audioChannels: event.target.value ? Number(event.target.value) : undefined
                              })
                            }
                          />
                        </label>
                      </SettingsGroup>

                      <SettingsGroup icon={<Cpu size={18} />} title="Advanced">
                        <label>
                          <Label help="AV1 and VP9 speed setting. Higher is faster but can reduce compression efficiency. Your past AV1 commands used 5.">
                            CPU used
                          </Label>
                          <input
                            type="number"
                            min="0"
                            max="8"
                            value={settings.cpuUsed}
                            disabled={settings.videoCodec === "libx264"}
                            onChange={(event) => setSettings({ ...settings, cpuUsed: Number(event.target.value) })}
                          />
                        </label>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={settings.rowMt}
                            disabled={settings.videoCodec !== "libaom-av1"}
                            onChange={(event) => setSettings({ ...settings, rowMt: event.target.checked })}
                          />
                          <span className="label-row">
                            AV1 row multithreading{" "}
                            <Help text="Adds -row-mt 1 for libaom-av1, which can improve AV1 encoding speed on multi-core CPUs." />
                          </span>
                        </label>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={settings.fastStart}
                            disabled={settings.outputContainer !== "mp4"}
                            onChange={(event) => setSettings({ ...settings, fastStart: event.target.checked })}
                          />
                          <span className="label-row">
                            MP4 fast-start{" "}
                            <Help text="Moves MP4 metadata to the front so browser playback can begin sooner before the whole file downloads." />
                          </span>
                        </label>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={settings.stripMetadata}
                            onChange={(event) => setSettings({ ...settings, stripMetadata: event.target.checked })}
                          />
                          <span className="label-row">
                            Strip metadata{" "}
                            <Help text="Removes embedded tags and metadata. This can reduce noise and avoid carrying private or irrelevant file metadata." />
                          </span>
                        </label>
                      </SettingsGroup>
                    </div>
                  </div>

                  <aside className="panel summary-panel">
                    <SectionHeader icon={<Gauge size={20} />} title="Custom Estimate" />
                    <div className="summary-hero">
                      <span>{estimate?.reduction === undefined ? "Estimate" : `${estimate.reduction}%`}</span>
                      <strong>{formatBytes(estimate?.bytes)}</strong>
                      <em>{qualityLabel(settings)}</em>
                    </div>
                    <div className="fields single">
                      <Field
                        label="Format"
                        value={`${settings.outputContainer.toUpperCase()} / ${codecLabel(settings.videoCodec)}`}
                      />
                      <Field label="Original" value={formatBytes(video.metadata.fileSize)} />
                      <Field
                        label="Audio"
                        value={
                          settings.audioMode === "remove"
                            ? "Removed"
                            : `${settings.audioCodec === "aac" ? "AAC" : "Opus"} ${settings.audioBitrateKbps} kbps`
                        }
                      />
                    </div>
                    <p className="muted">{estimate?.note}</p>
                    <div className="recommendations">
                      {recommendations.slice(0, 3).map((item) => (
                        <div className={`recommendation ${item.tone}`} key={item.text}>
                          <CheckCircle2 size={16} />
                          <span>{item.text}</span>
                        </div>
                      ))}
                    </div>
                    <div className="notice info">{nextExportSuggestion(settings)}</div>
                    {capabilities &&
                      (!capabilities.libx264 ||
                        !capabilities.libaomAv1 ||
                        !capabilities.aac ||
                        !capabilities.libopus) && (
                        <div className="notice warn">
                          FFmpeg capability check:{" "}
                          {[
                            !capabilities.libx264 && "H.264 unavailable",
                            !capabilities.libaomAv1 && "AV1 unavailable",
                            !capabilities.aac && "AAC unavailable",
                            !capabilities.libopus && "Opus unavailable"
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                      )}
                    <div className="summary-actions">
                      <button className="button primary" onClick={startJob} disabled={job?.status === "running"}>
                        <Play size={18} />
                        {job?.status === "running" ? "Processing..." : "Export Current Settings"}
                      </button>
                      <button
                        className="button secondary"
                        onClick={startSampleJob}
                        disabled={sampleJob?.status === "running"}
                      >
                        <Gauge size={18} />
                        Test 5-Second Sample
                      </button>
                      <button className="button secondary" onClick={startPairJobs}>
                        <Package size={18} />
                        Create Default Website Pair
                      </button>
                    </div>
                    <p className="muted">
                      Use Export Current Settings for the exact controls above. Default Website Pair creates the
                      standard MP4 fallback and AV1/WebM recipe.
                    </p>
                    {error && <div className="notice error">{error}</div>}
                  </aside>
                </div>
              </section>
            )}

            {video && activeView === "compare" && (
              <section className="workflow-section" id="compare">
                <SectionHeader
                  icon={<Layers size={21} />}
                  title="Compare & Download"
                  kicker={
                    job?.status === "completed" && job.kind === "encode"
                      ? `Reviewing ${job.outputFileName ?? variationLabel(job)}.`
                      : "Your completed export will appear here after processing."
                  }
                />
                {job?.status === "completed" && job.kind === "encode" ? (
                  <div className="compare-theater">
                    <div className="theater-toolbar">
                      <div>
                        <strong>{job.outputFileName ?? "Optimized video"}</strong>
                        <span>
                          {completedReduction === undefined
                            ? "Optimized output"
                            : `${completedReduction}% smaller than source`}
                        </span>
                      </div>
                      <label className="sync-toggle">
                        <input
                          type="checkbox"
                          checked={syncPlayback}
                          onChange={(event) => setSyncPlayback(event.target.checked)}
                        />
                        Sync playback
                      </label>
                    </div>

                    <div className="theater-canvas">
                      <div className="theater-pane">
                        <span className="theater-label">Original</span>
                        <video
                          controls
                          ref={originalCompareRef}
                          src={sourceUrl}
                          onPlay={() => syncVideoState("original", "play")}
                          onPause={() => syncVideoState("original", "pause")}
                          onSeeked={() => syncVideoState("original", "seek")}
                          onRateChange={() => syncVideoState("original", "rate")}
                        />
                      </div>
                      <div className="theater-divider" />
                      <div className="theater-pane">
                        <span className="theater-label optimized">Optimized</span>
                        <video
                          controls
                          ref={optimizedCompareRef}
                          src={outputUrl}
                          onPlay={() => syncVideoState("optimized", "play")}
                          onPause={() => syncVideoState("optimized", "pause")}
                          onSeeked={() => syncVideoState("optimized", "seek")}
                          onRateChange={() => syncVideoState("optimized", "rate")}
                        />
                      </div>
                    </div>

                    <div className="theater-footer">
                      <div className="theater-stats">
                        <Field label="Original" value={formatBytes(video.metadata.fileSize)} />
                        <Field label="Optimized" value={formatBytes(job.outputSize)} />
                        <Field
                          label="Format"
                          value={`${job.settings.outputContainer.toUpperCase()} / ${codecLabel(job.settings.videoCodec)}`}
                        />
                        <Field label="Savings" value={fileSizeDelta(job.outputSize, video.metadata.fileSize)} />
                      </div>
                      <div className="actions">
                        <a className="button primary" href={downloadUrl}>
                          <Download size={18} />
                          Download Video
                        </a>
                        {posterUrl && (
                          <a className="button secondary" href={`${apiBaseUrl}/api/jobs/${posterJob?.id}/download`}>
                            <Download size={18} />
                            Poster
                          </a>
                        )}
                        <button
                          className="button secondary"
                          onClick={() => navigator.clipboard.writeText(job.ffmpegCommand)}
                        >
                          <Copy size={18} />
                          FFmpeg
                        </button>
                        <button className="button secondary" onClick={() => navigator.clipboard.writeText(videoMarkup)}>
                          <Copy size={18} />
                          HTML
                        </button>
                      </div>
                    </div>

                    <details className="details-panel compare-details">
                      <summary>Command and website markup</summary>
                      <h3>FFmpeg Command</h3>
                      <pre>{job.ffmpegCommand}</pre>
                      <h3>Website Markup</h3>
                      <pre>{videoMarkup}</pre>
                      <div className="notice info">{nextExportSuggestion(job.settings)}</div>
                    </details>
                  </div>
                ) : (
                  <div className="panel empty-panel">
                    <SectionHeader icon={<BadgeCheck size={20} />} title="No Export Yet" />
                    <p className="muted">
                      Choose a preset, review the export summary, and process the video. The comparison view will open
                      up here.
                    </p>
                  </div>
                )}
              </section>
            )}

            {video && activeView === "captions" && (
              <section className="workflow-section" id="captions">
                <SectionHeader
                  icon={<Captions size={21} />}
                  title="Subtitle Theatre"
                  kicker="Preview captions like a browser text track, then clean up the WebVTT source."
                />
                {editingSubtitleJob ? (
                  <div className="caption-theater">
                    <div className="subtitle-editor-header">
                      <div>
                        <strong>{editingSubtitleJob.outputFileName ?? "Generated captions"}</strong>
                        <span>Save updates the VTT file and regenerates the SRT sidecar.</span>
                      </div>
                      <div className="actions">
                        <button className="button secondary" onClick={() => setActiveView("outputs")}>
                          <Package size={17} />
                          Back To Outputs
                        </button>
                        <button
                          className="button primary"
                          onClick={() => void saveSubtitleEdits()}
                          disabled={isSavingSubtitles}
                        >
                          <Save size={17} />
                          {isSavingSubtitles ? "Saving..." : "Save Captions"}
                        </button>
                        <button
                          className="button secondary"
                          onClick={() => setSubtitleDraft((current) => cleanSubtitleDraft(current))}
                        >
                          <Sparkles size={17} />
                          Clean Transcript
                        </button>
                        <a
                          className="button secondary"
                          href={`${apiBaseUrl}/api/jobs/${editingSubtitleJob.id}/download`}
                        >
                          <Download size={17} />
                          VTT
                        </a>
                        {editingSubtitleJob.sidecarFileName && (
                          <a
                            className="button secondary"
                            href={`${apiBaseUrl}/api/jobs/${editingSubtitleJob.id}/sidecar`}
                          >
                            <Download size={17} />
                            SRT
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="subtitle-stage">
                      <video
                        key={`${editingSubtitleJob.id}-${subtitlePreviewKey}`}
                        controls
                        crossOrigin="anonymous"
                        preload="metadata"
                        src={sourceUrl}
                        onLoadedMetadata={(event) => {
                          const [track] = Array.from(event.currentTarget.textTracks);
                          if (track) track.mode = "showing";
                        }}
                      >
                        <track
                          src={`${apiBaseUrl}/api/jobs/${editingSubtitleJob.id}/output?preview=${subtitlePreviewKey}`}
                          kind="subtitles"
                          srcLang="en"
                          label="English"
                          default
                        />
                      </video>
                      <div className="subtitle-stage-label">
                        <Captions size={17} />
                        Browser subtitle preview
                      </div>
                    </div>
                    <div className="subtitle-editor-drawer">
                      <div className="subtitle-editor-copy">
                        <label className="label-row" htmlFor="subtitle-draft">
                          WebVTT captions
                          <Help text="Keep the WEBVTT header and cue timings. Save updates the VTT and regenerates SRT automatically." />
                        </label>
                        <p className="muted">
                          Preview uses the last saved file. After editing, save captions and replay this theatre preview
                          to check timing and wording.
                        </p>
                      </div>
                      <textarea
                        id="subtitle-draft"
                        value={subtitleDraft}
                        spellCheck
                        onChange={(event) => setSubtitleDraft(event.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="panel empty-panel">
                    <SectionHeader icon={<Captions size={20} />} title="No Captions Selected" />
                    <p className="muted">
                      Open a completed caption output from Jobs & Outputs to review and edit it here.
                    </p>
                    <button className="button secondary" onClick={() => setActiveView("outputs")}>
                      Back To Outputs
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </section>

      {activePosterPreview && activePosterUrl && (
        <div
          className="lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Poster preview"
          onWheel={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePosterLightbox();
          }}
        >
          <div className="poster-lightbox">
            <div className="lightbox-toolbar">
              <div>
                <strong>{activePosterPreview.outputFileName ?? "Generated poster"}</strong>
                <span>
                  {Math.round(posterZoom * 100)}% zoom{posterZoom > 1 ? " / drag to pan" : ""}
                </span>
              </div>
              <div className="lightbox-actions">
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => updatePosterZoom(posterZoom - 0.25)}
                  disabled={posterZoom <= 1}
                  aria-label="Zoom out"
                >
                  <ZoomOut size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => updatePosterZoom(1)}
                  disabled={posterZoom === 1 && posterPan.x === 0 && posterPan.y === 0}
                  aria-label="Reset poster zoom"
                >
                  1x
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => updatePosterZoom(posterZoom + 0.25)}
                  disabled={posterZoom >= 4}
                  aria-label="Zoom in"
                >
                  <ZoomIn size={18} />
                </button>
                <a className="button secondary" href={`${apiBaseUrl}/api/jobs/${activePosterPreview.id}/download`}>
                  <Download size={17} />
                  Download
                </a>
                <button
                  className="icon-button"
                  type="button"
                  onClick={closePosterLightbox}
                  aria-label="Close poster preview"
                >
                  <X size={19} />
                </button>
              </div>
            </div>
            <div
              className={`lightbox-stage ${posterZoom > 1 ? "zoomed" : ""}`}
              onPointerDown={startPosterPan}
              onPointerMove={movePosterPan}
              onPointerUp={stopPosterPan}
              onPointerCancel={stopPosterPan}
              onWheel={(event) => {
                event.preventDefault();
                updatePosterZoom(posterZoom + (event.deltaY < 0 ? 0.25 : -0.25));
              }}
            >
              <img
                src={activePosterUrl}
                alt={activePosterPreview.outputFileName ?? "Generated poster preview"}
                draggable={false}
                style={{ transform: `translate(${posterPan.x}px, ${posterPan.y}px) scale(${posterZoom})` }}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
