#!/bin/bash
set -e

audio_3oa="Vaudeville_GOOGLE_ECPLIPSA_AUDIO_MIX_241230_3OA.wav"
audio_stereo="Vaudeville_GOOGLE_ECPLIPSA_AUDIO_MIX_241230_Stereo.wav"
video="Eclipsa_Final_Opt1_WithLogo_av1.mp4"
iamf_output="eclipsa_3oa_stereo_frag_fixed.mp4"

ffmpeg -y \
    -i "${audio_3oa}" -i "${audio_stereo}" \
    -i "${video}" -c:v copy \
    -filter_complex "[1:a]channelmap=0|1:stereo[STEREO_TRACK]" \
    -map 0:a -map "[STEREO_TRACK]" -map 2:0 \
    -stream_group "type=iamf_audio_element:id=1:st=0:audio_element_type=scene,layer=ch_layout=ambisonic:ambisonics_mode=projection," \
    -stream_group "type=iamf_audio_element:id=2:st=1:audio_element_type=channel,layer=ch_layout=stereo" \
    -stream_group "type=iamf_mix_presentation:id=3:stg=0:stg=1:annotations=en-us=default_mix_presentation,submix=parameter_id=100:parameter_rate=48000:default_mix_gain=0.0|element=stg=0:headphones_rendering_mode=binaural:annotations=en-us=3OA:parameter_id=101:parameter_rate=48000:default_mix_gain=0.0|element=stg=1:headphones_rendering_mode=stereo:annotations=en-us=stereo:parameter_id=102:parameter_rate=48000:default_mix_gain=0.0|layout=sound_system=stereo:integrated_loudness=-15.2:digital_peak=0.0" \
    -streamid 0:0 -streamid 1:1 -streamid 2:2 \
    -c:a libopus -b:a 256000 \
    -movflags frag_keyframe+empty_moov+default_base_moof \
    "${iamf_output}"
