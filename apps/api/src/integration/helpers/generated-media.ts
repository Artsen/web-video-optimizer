import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function ensureMediaTools(): Promise<{ ffmpegVersion: string; ffprobeVersion: string }> {
  const [ffmpeg, ffprobe] = await Promise.all([
    execFileAsync("ffmpeg", ["-version"], { windowsHide: true }),
    execFileAsync("ffprobe", ["-version"], { windowsHide: true })
  ]);
  return {
    ffmpegVersion: ffmpeg.stdout.split("\n")[0],
    ffprobeVersion: ffprobe.stdout.split("\n")[0]
  };
}

export async function generateAvFixture(outputPath: string, durationSeconds = 2): Promise<string[]> {
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=160x90:rate=24:duration=${durationSeconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=880:sample_rate=48000:duration=${durationSeconds}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-shortest",
    outputPath
  ];
  await execFileAsync("ffmpeg", args, { windowsHide: true });
  return ["ffmpeg", ...args];
}

export async function generateAudioFixture(outputPath: string, durationSeconds = 2): Promise<string[]> {
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=880:sample_rate=48000:duration=${durationSeconds}`,
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    outputPath
  ];
  await execFileAsync("ffmpeg", args, { windowsHide: true });
  return ["ffmpeg", ...args];
}

export async function probeJson(filePath: string): Promise<Record<string, unknown>> {
  const result = await execFileAsync(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
    { windowsHide: true, maxBuffer: 1024 * 1024 }
  );
  return JSON.parse(result.stdout) as Record<string, unknown>;
}
