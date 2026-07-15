import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function createTinyVideoFixture(testOutputDir: string): Promise<string> {
  await fs.mkdir(testOutputDir, { recursive: true });
  const outputPath = path.join(testOutputDir, "tiny-e2e-video.mp4");
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x90:rate=12:duration=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-shortest",
    outputPath
  ];
  try {
    await execFileAsync("ffmpeg", args, { windowsHide: true });
  } catch (error) {
    throw new Error(`Unable to generate E2E video fixture with FFmpeg: ${String(error)}`);
  }
  return outputPath;
}

export async function createFakeMp4Fixture(testOutputDir: string): Promise<string> {
  await fs.mkdir(testOutputDir, { recursive: true });
  const outputPath = path.join(testOutputDir, "fake.mp4");
  await fs.writeFile(outputPath, "this is not a video");
  return outputPath;
}
