export type FFprobeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  display_aspect_ratio?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
  pix_fmt?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<Record<string, unknown>>;
};

export type FFprobeResult = {
  format?: {
    filename?: string;
    format_name?: string;
    format_long_name?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
  };
  streams?: FFprobeStream[];
};
