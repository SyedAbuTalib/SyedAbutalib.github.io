#!/bin/bash
set -e

audio_3oa="Vaudeville_GOOGLE_ECPLIPSA_AUDIO_MIX_241230_3OA.wav"
audio_stereo="Vaudeville_GOOGLE_ECPLIPSA_AUDIO_MIX_241230_Stereo.wav"
video="Eclipsa_Final_Opt1_WithLogo_av1.mp4"
iamf_output="eclipsa_3oa_stereo_frag.mp4"

ffmpeg -y \
    -i "${audio_3oa}" -i "${audio_stereo}" \
    -i "${video}" -c:v copy \
    -filter_complex "[0:a]channelmap=0:mono[A0];[0:a]channelmap=1:mono[A1];[0:a]channelmap=2:mono[A2];[0:a]channelmap=3:mono[A3];[0:a]channelmap=4:mono[A4];[0:a]channelmap=5:mono[A5];[0:a]channelmap=6:mono[A6];[0:a]channelmap=7:mono[A7];[0:a]channelmap=8:mono[A8];[0:a]channelmap=9:mono[A9];[0:a]channelmap=10:mono[A10];[0:a]channelmap=11:mono[A11];[0:a]channelmap=12:mono[A12];[0:a]channelmap=13:mono[A13];[0:a]channelmap=14:mono[A14];[0:a]channelmap=15:mono[A15]" \
    -filter_complex "[1:a]channelmap=0|1:stereo[FRONT]" \
    -map "[A0]" -map "[A1]" -map "[A2]" -map "[A3]" -map "[A4]" -map "[A5]" -map "[A6]" -map "[A7]" -map "[A8]" -map "[A9]" -map "[A10]" -map "[A11]" -map "[A12]" -map "[A13]" -map "[A14]" -map "[A15]" -map "[FRONT]" -map 2:0 \
    -stream_group "type=iamf_audio_element:id=1:st=0:st=1:st=2:st=3:st=4:st=5:st=6:st=7:st=8:st=9:st=10:st=11:st=12:st=13:st=14:st=15:audio_element_type=scene,layer=ch_layout=ambisonic\ 3:ambisonics_mode=mono," \
    -stream_group "type=iamf_audio_element:id=2:st=16:audio_element_type=channel,layer=ch_layout=stereo" \
    -stream_group "type=iamf_mix_presentation:id=3:stg=0:stg=1:annotations=en-us=default_mix_presentation,submix=parameter_id=100:parameter_rate=48000:default_mix_gain=0.0|element=stg=0:headphones_rendering_mode=binaural:annotations=en-us=3OA:parameter_id=101:parameter_rate=48000:default_mix_gain=0.0|element=stg=1:headphones_rendering_mode=stereo:annotations=en-us=stereo:parameter_id=101:parameter_rate=48000:default_mix_gain=0.0|layout=sound_system=stereo:integrated_loudness=-15.2:digital_peak=0.0" \
    -streamid 0:0 -streamid 1:1 -streamid 2:2 -streamid 3:3 -streamid 4:4 -streamid 5:5 -streamid 6:6 -streamid 7:7 -streamid 8:8 -streamid 9:9 -streamid 10:10 -streamid 11:11 -streamid 12:12 -streamid 13:13 -streamid 14:14 -streamid 15:15 -streamid 16:16 -streamid 17:17 \
    -c:a libopus -b:a 64000 \
    -movflags frag_keyframe+empty_moov+default_base_moof \
    "${iamf_output}"
