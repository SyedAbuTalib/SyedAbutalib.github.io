#!/bin/bash

audio="7_1_4.wav"
video="silent.mp4"
output_iamf="714_frag.mp4"

ffmpeg -y\
    -i "7_1_4.wav" \
    -i "silent.mp4" -c:v copy \
    -filter_complex "[0:a]channelmap=0|1:stereo[FRONT];[0:a]channelmap=4|5:stereo[SIDE];[0:a]channelmap=6|7:stereo[BACK];[0:a]channelmap=8|9:stereo[TOP_FRONT];[0:a]channelmap=10|11:stereo[TOP_BACK];[0:a]channelmap=2:mono[CENTER];[0:a]channelmap=3:mono[LFE]" \
    -map "[FRONT]" -map "[SIDE]" -map "[BACK]" -map "[TOP_FRONT]" -map "[TOP_BACK]" -map "[CENTER]" -map "[LFE]" -map 1:0 \
    -stream_group "type=iamf_audio_element:id=1:st=0:st=1:st=2:st=3:st=4:st=5:st=6:audio_element_type=channel,layer=ch_layout=7.1.4" \
    -stream_group "type=iamf_mix_presentation:id=3:stg=0:annotations=en-us=default_mix_presentation,submix=parameter_id=100:parameter_rate=48000:default_mix_gain=0.0|element=stg=0:headphones_rendering_mode=binaural:annotations=en-us=7.1.4:parameter_id=101:parameter_rate=48000:default_mix_gain=0.0|layout=sound_system=7.1.4:integrated_loudness=-19.6:digital_peak=-1.5" \
    -streamid 0:0 -streamid 1:1 -streamid 2:2 -streamid 3:3 -streamid 4:4 -streamid 5:5 -streamid 6:6 -streamid 7:7 \
    -c:a libopus -b:a 64000 \
    -movflags frag_keyframe+empty_moov+default_base_moof \
    "714_frag.mp4"
