export type Demo = {
	title: string;
	href: string;
	description: string;
};

export const demos: Demo[] = [
	{
		title: "Spatial Audio Test Page",
		href: "/spatial_audio/",
		description:
			"Demonstrates playback of potentially spatialized MP4 video/audio files and includes a Web Audio API example for 3D positional audio.",
	},
	{
		title: "Video Flip Test Page",
		href: "/flip/",
		description:
			"Features live camera preview, video recording with selectable MIME types, a conceptual video flip effect.",
	},
	{
		title: "WebCodecs Opus Test",
		href: "/opus/",
		description:
			"Tests the WebCodecs AudioEncoder and AudioDecoder with the Opus codec and a user-defined frame duration.",
	},
	{
		title: "VTTCue Timing Test",
		href: "/vtt/",
		description:
			"Dynamically injecting a VTTCue into a video track to observe its timing and event behavior.",
	},
	{
		title: "Audio Playback Test",
		href: "/bitdepth/",
		description:
			"Record a 5-second audio clip from a microphone and play it back to verify capture quality.",
	},
	{
		title: "MSE Test Page",
		href: "/mse/",
		description:
			"Media Source Extensions (MSE) test page for various media types using source URL and type as query parameters.",
	},
	{
		title: "Media Formats Test",
		href: "/formats/",
		description:
			"Verifies that the browser can successfully record and natively play back media formats (e.g., Matroska, QuickTime).",
	},
	{
		title: "Autoplay Test Page",
		href: "/autoplay/",
		description: "Tests the browser's autoplay permissions for audio playback.",
	},
	{
		title: "Multichannel Audio Verification Suite",
		href: "/9ch/",
		description:
			"Verifies decodeAudioData(), Web Audio multichannel routing, and direct <audio> element playback with per-channel peak level meters.",
	},
	{
		title: "Spotify Heardle",
		href: "https://syedabutalib.github.io/heardle/",
		description:
			"Game where a Premium Spotify User can log in and play a song guessing game based on their playlists.",
	},
	{
		title: "Poople Map",
		href: "https://syedabutalib.github.io/pmap/",
		description: "Every road leads to poop.",
	},
	{
		title: "Speedometer Next",
		href: "https://syedabutalib.github.io/Speedometer/",
		description: "An open source repository for the Speedometer benchmark.",
	},
	{
		title: "IAMF Web Studio",
		href: "https://syedabutalib.github.io/iamf-web-studio/",
		description:
			"A specialized web-based studio for creating, editing, and previewing Immersive Audio Model and Formats (IAMF) content.",
	},
];
