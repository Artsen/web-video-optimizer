import { Cpu, FileVideo, Package, Volume2, Settings2 } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import type { OptimizationSettings } from "@local-video-optimizer/contracts";
import { qualityLabel } from "../../domain/job-presenters";
import { Help, Label } from "../../components/ui/Help";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { SettingsGroup } from "../../components/ui/SettingsGroup";

type Settings = OptimizationSettings & {
  audioBitrateKbps: number;
  cpuUsed: number;
  outputFilename: string;
  rowMt: boolean;
};

export function OptimizationSettingsForm({ controller }: { controller: VideoOptimizerAppController }) {
  const { custom } = controller;
  const settings = custom.settings as Settings;
  const setSettings = custom.setSettings;

  return (
    <details className="panel settings-panel settings-disclosure">
      <summary>
        <SectionHeader
          icon={<Settings2 size={20} />}
          title="Advanced settings"
          kicker="Open this when you need exact filename, codec, audio, CRF, and encoder controls."
        />
      </summary>
      <div className="settings-disclosure-body">
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
              onChange={(event) => custom.updateOutputContainer(event.target.value as Settings["outputContainer"])}
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
              onChange={(event) => custom.updateVideoCodec(event.target.value as Settings["videoCodec"])}
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
                setSettings({ ...settings, width: event.target.value ? Number(event.target.value) : undefined })
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
                setSettings({ ...settings, frameRate: event.target.value ? Number(event.target.value) : undefined })
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
              onChange={(event) => setSettings({ ...settings, preset: event.target.value as Settings["preset"] })}
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
              onChange={(event) => setSettings({ ...settings, audioMode: event.target.value as Settings["audioMode"] })}
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
              onChange={(event) => setSettings({ ...settings, audioBitrateKbps: Number(event.target.value) })}
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
                setSettings({ ...settings, audioChannels: event.target.value ? Number(event.target.value) : undefined })
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
    </details>
  );
}
