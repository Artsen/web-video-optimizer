import type { Capabilities } from "@local-video-optimizer/contracts";
import type { FfmpegCapabilitiesAdapter } from "../infrastructure/tools/ffmpeg-capabilities-adapter.js";
import type { WhisperAdapter } from "../infrastructure/tools/whisper-adapter.js";
import type { VideoDownloader } from "../infrastructure/tools/yt-dlp-adapter.js";

export class CapabilitiesService {
  constructor(
    private readonly ffmpeg: FfmpegCapabilitiesAdapter,
    private readonly whisper: WhisperAdapter,
    private readonly downloader: VideoDownloader
  ) {}

  async getCapabilities(): Promise<Capabilities> {
    const whisperCommand = await this.whisper.resolveCommand();
    const ytDlpCommand = await this.downloader.resolveCommand();
    return {
      ...(await this.ffmpeg.getCapabilities()),
      whisperCpp: Boolean(whisperCommand),
      whisperModel: this.whisper.hasModel(),
      whisperCommand,
      whisperModelPath: this.whisper.modelPath(),
      ytDlp: Boolean(ytDlpCommand),
      ytDlpCommand,
      ytDlpJsRuntime: this.downloader.jsRuntimeValue()
    };
  }
}
