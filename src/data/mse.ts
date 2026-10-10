export const MSE_TYPES: Record<string, string> = {
  mp4: 'video/mp4; codecs="avc1.4D4041,mp4a.40.2"',
  webm: 'video/webm; codecs="opus,vp9"',
  mp3: "audio/mpeg",
  mp4a: 'audio/mp4; codecs="mp4a.40.2"',
  mp4v: 'video/mp4; codecs="avc1.4D4041"',
  mp4_av1: 'video/mp4; codecs="av01.0.04M.08"',
  webm_av1: 'video/webm; codecs="av1"',
  webm_vp8: 'video/webm; codecs="vp8, vorbis"',
  webm_vp9: 'video/webm; codecs="vp9"',
  opus: 'audio/webm; codecs="opus"',
  mp4_opus: 'audio/mp4; codecs="opus"',
  wav: "audio/wav",
  adts: "audio/aac",
  audio_iamf_opus: 'audio/mp4; codecs="iamf.001.001.Opus"',
  mp4_iamf_avc_baseline_l50:
    'video/mp4; codecs="avc1.42E032, iamf.001.001.Opus"',
  mp4_iamf_avc_high_l40: 'video/mp4; codecs="avc1.640028, iamf.001.001.Opus"',
  mp4_iamf_avc_high444_l31:
    'video/mp4; codecs="avc1.F4001F, iamf.001.001.Opus"',
  mp4_iamf_av1_l50: 'video/mp4; codecs="av01.0.12M.08, iamf.001.001.Opus"',
  mp4_hevc_rext_pcm: 'video/mp4; codecs="hvc1.4.10.L150.B0, pcm_s24le"',
  mp4_avc_high_l40: 'video/mp4; codecs="avc1.640028"',
  mp4_avc_main_l41_aac: 'video/mp4; codecs="avc1.4D4029, mp4a.40.2"',
};

export type MseSample = {
  name: string;
  type: keyof typeof MSE_TYPES;
  label?: string;
};

export const MSE_SAMPLES: MseSample[] = [
  { name: "iamf_sine_500ms.mp4", type: "audio_iamf_opus" },
  { name: "iamf_syed_voice_audio_only.mp4", type: "audio_iamf_opus" },
  {
    name: "iamf_syed_video_and_audio.mp4",
    type: "mp4_iamf_avc_baseline_l50",
    label: "Fragmented AVC Baseline L5.0",
  },
  {
    name: "714_frag.mp4",
    type: "mp4_iamf_avc_high_l40",
    label: "AVC High L4.0, IAMF",
  },
  {
    name: "iamf_alternating_sine_waves_714.mp4",
    type: "mp4_iamf_avc_high_l40",
    label: "7.1.4, AVC High L4.0, IAMF",
  },
  {
    name: "iamf_alternating_sine_waves_stereo.mp4",
    type: "mp4_iamf_avc_high_l40",
    label: "Stereo, AVC High L4.0, IAMF",
  },
  {
    name: "iamf_video_testsrc.mp4",
    type: "mp4_iamf_avc_high444_l31",
    label: "AVC High 4:4:4 Predictive L3.1, IAMF",
  },
];
