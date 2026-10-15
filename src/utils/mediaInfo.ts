/**
 * Sniffs the audio configuration out of a media *initialization segment* (the bytes a page
 * already has in hand before handing them to a SourceBuffer).
 *
 * Why: no HTMLMediaElement API exposes the decoded channel count. `AudioTrack` only carries
 * id/kind/label/language (and is behind a flag in Chromium), and routing the element through
 * Web Audio to count channels would change the very playback path being tested. The container
 * headers, however, spell it out:
 *
 *   - ISOBMFF/MP4: `moov > trak > mdia > minf > stbl > stsd` AudioSampleEntry.channelcount,
 *     refined by codec boxes: `esds` (AAC channelConfiguration), `dOps` (Opus), `dac3`/`dec3`
 *     (AC-3/E-AC-3), `dfLa` (FLAC) and `iacb` (IAMF descriptor OBUs → audio element layouts).
 *   - WebM/Matroska: `Segment > Tracks > TrackEntry > Audio > Channels`.
 *   - Raw ADTS/MP3/WAV frame or RIFF headers.
 *
 * Everything here is pure DataView work, so it also runs under Node for testing.
 */

export type AudioStreamInfo = {
	container: "mp4" | "webm" | "adts" | "mp3" | "wav" | "unknown";
	/** Human-readable codec, e.g. "AAC-LC", "Opus", "IAMF (Opus)". */
	codec?: string;
	/** Total decoded channel count, when the headers say. */
	channels?: number;
	/** Named layout when known, e.g. "stereo", "5.1", "7.1.4". */
	layout?: string;
	sampleRate?: number;
	/** Extra lines, e.g. IAMF audio elements and mix presentations. */
	details: string[];
	/** False when more bytes are needed to reach the audio headers. */
	complete: boolean;
};

const utf8 = new TextDecoder();

function fourcc(view: DataView, offset: number) {
	return String.fromCharCode(
		view.getUint8(offset),
		view.getUint8(offset + 1),
		view.getUint8(offset + 2),
		view.getUint8(offset + 3),
	);
}

/** Describes a channel count with its conventional name. */
export function describeChannels(count: number) {
	const names: Record<number, string> = {
		1: "mono",
		2: "stereo",
		6: "5.1",
		8: "7.1",
		10: "5.1.4 / 7.1.2",
		12: "7.1.4",
		16: "9.1.6",
		24: "22.2",
	};
	const name = names[count];
	return name ? `${count} ch (${name})` : `${count} ch`;
}

/* ------------------------------------------------------------------------------------------- */
/* ISOBMFF                                                                                      */
/* ------------------------------------------------------------------------------------------- */

const MP4_TOP_LEVEL = new Set([
	"ftyp",
	"styp",
	"moov",
	"moof",
	"mdat",
	"sidx",
	"free",
	"skip",
	"wide",
	"uuid",
	"emsg",
	"prft",
	"meta",
	"pdin",
]);

type Box = { type: string; start: number; bodyStart: number; end: number };

function* boxes(view: DataView, start: number, end: number): Generator<Box> {
	let pos = start;
	while (pos + 8 <= end) {
		let size = view.getUint32(pos);
		const type = fourcc(view, pos + 4);
		let header = 8;
		if (size === 1) {
			if (pos + 16 > end) return;
			size = Number(view.getBigUint64(pos + 8));
			header = 16;
		} else if (size === 0) {
			size = end - pos;
		}
		if (size < header) return;
		yield { type, start: pos, bodyStart: pos + header, end: Math.min(pos + size, end) };
		pos += size;
	}
}

function findBox(view: DataView, start: number, end: number, type: string) {
	for (const box of boxes(view, start, end)) if (box.type === type) return box;
	return undefined;
}

const AAC_SAMPLE_RATES = [
	96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
];
/** MPEG-4 audio channelConfiguration → channel count. */
const AAC_CHANNELS: Record<number, number> = {
	1: 1,
	2: 2,
	3: 3,
	4: 4,
	5: 5,
	6: 6,
	7: 8,
	11: 7,
	12: 8,
	13: 24,
	14: 8,
};

/** Reads the AudioSpecificConfig out of an `esds` box body. */
function parseEsds(view: DataView, start: number, end: number) {
	let pos = start + 4; // FullBox version/flags
	const readDescriptor = () => {
		const tag = view.getUint8(pos++);
		let size = 0;
		for (let i = 0; i < 4; i++) {
			const byte = view.getUint8(pos++);
			size = (size << 7) | (byte & 0x7f);
			if (!(byte & 0x80)) break;
		}
		return { tag, size, bodyStart: pos };
	};
	const es = readDescriptor();
	if (es.tag !== 0x03) return undefined;
	pos += 2; // ES_ID
	const flags = view.getUint8(pos++);
	if (flags & 0x80) pos += 2; // dependsOn_ES_ID
	if (flags & 0x40) pos += 1 + view.getUint8(pos); // URL
	if (flags & 0x20) pos += 2; // OCR_ES_Id
	const dcd = readDescriptor();
	if (dcd.tag !== 0x04) return undefined;
	const objectTypeIndication = view.getUint8(pos);
	pos += 13;
	const dsi = readDescriptor();
	if (dsi.tag !== 0x05 || pos + 2 > end) return { objectTypeIndication };

	// AudioSpecificConfig bit reader
	let bitPos = 0;
	const bits = (n: number) => {
		let value = 0;
		for (let i = 0; i < n; i++) {
			const byte = view.getUint8(dsi.bodyStart + (bitPos >> 3));
			value = (value << 1) | ((byte >> (7 - (bitPos & 7))) & 1);
			bitPos++;
		}
		return value;
	};
	let audioObjectType = bits(5);
	if (audioObjectType === 31) audioObjectType = 32 + bits(6);
	const samplingFrequencyIndex = bits(4);
	const sampleRate =
		samplingFrequencyIndex === 15 ? bits(24) : AAC_SAMPLE_RATES[samplingFrequencyIndex];
	const channelConfiguration = bits(4);
	const aacNames: Record<number, string> = {
		1: "AAC Main",
		2: "AAC-LC",
		3: "AAC SSR",
		4: "AAC LTP",
		5: "HE-AAC",
		29: "HE-AACv2",
		42: "xHE-AAC",
	};
	return {
		objectTypeIndication,
		codec: aacNames[audioObjectType] ?? `MPEG-4 audio (AOT ${audioObjectType})`,
		sampleRate,
		channels: AAC_CHANNELS[channelConfiguration],
	};
}

/* ---- AC-3 / E-AC-3 -------------------------------------------------------------------------- */

const AC3_ACMOD_CHANNELS = [2, 1, 2, 3, 3, 4, 4, 5];
const AC3_ACMOD_NAMES = [
	"1+1",
	"mono",
	"stereo",
	"3.0",
	"2.1 (L R S)",
	"3.1 (L C R S)",
	"4.0 (2/2)",
	"5.0",
];
const AC3_SAMPLE_RATES = [48000, 44100, 32000];

function parseDac3(view: DataView, start: number) {
	// fscod(2) bsid(5) bsmod(3) acmod(3) lfeon(1) bit_rate_code(5) reserved(5)
	const b0 = view.getUint8(start);
	const b1 = view.getUint8(start + 1);
	const fscod = b0 >> 6;
	const acmod = (b1 >> 3) & 0x07;
	const lfeon = (b1 >> 2) & 1;
	return ac3Layout(acmod, lfeon, AC3_SAMPLE_RATES[fscod]);
}

function parseDec3(view: DataView, start: number) {
	// data_rate(13) num_ind_sub(3) | fscod(2) bsid(5) reserved(1) asvc(1) bsmod(3) acmod(3) lfeon(1) ...
	const b2 = view.getUint8(start + 2);
	const b3 = view.getUint8(start + 3);
	const fscod = b2 >> 6;
	const acmod = (b3 >> 1) & 0x07;
	const lfeon = b3 & 1;
	return ac3Layout(acmod, lfeon, AC3_SAMPLE_RATES[fscod]);
}

function ac3Layout(acmod: number, lfeon: number, sampleRate: number | undefined) {
	const channels = (AC3_ACMOD_CHANNELS[acmod] ?? 0) + lfeon;
	const base = AC3_ACMOD_NAMES[acmod] ?? "";
	const layout = acmod === 7 && lfeon ? "5.1" : lfeon ? `${base} + LFE` : base;
	const info: { channels: number; layout: string; sampleRate?: number } = { channels, layout };
	if (sampleRate !== undefined) info.sampleRate = sampleRate;
	return info;
}

/* ---- IAMF ----------------------------------------------------------------------------------- */

const IAMF_LAYOUTS: Record<number, { name: string; channels: number }> = {
	0: { name: "mono", channels: 1 },
	1: { name: "stereo", channels: 2 },
	2: { name: "5.1", channels: 6 },
	3: { name: "5.1.2", channels: 8 },
	4: { name: "5.1.4", channels: 10 },
	5: { name: "7.1", channels: 8 },
	6: { name: "7.1.2", channels: 10 },
	7: { name: "7.1.4", channels: 12 },
	8: { name: "3.1.2", channels: 6 },
	9: { name: "binaural", channels: 2 },
};
const IAMF_EXPANDED_LAYOUTS: Record<number, { name: string; channels: number }> = {
	0: { name: "LFE", channels: 1 },
	1: { name: "stereo-S", channels: 2 },
	2: { name: "stereo-SS", channels: 2 },
	3: { name: "stereo-TF", channels: 2 },
	4: { name: "stereo-TB", channels: 2 },
	5: { name: "top-4ch", channels: 4 },
	6: { name: "3.0ch", channels: 3 },
	7: { name: "9.1.6", channels: 16 },
	8: { name: "stereo-F", channels: 2 },
	9: { name: "stereo-Si", channels: 2 },
	10: { name: "stereo-TpSi", channels: 2 },
	11: { name: "top-6ch", channels: 6 },
};
/** Mix presentation `sound_system` (ITU-R BS.2051 + IAMF additions). */
const IAMF_SOUND_SYSTEMS: Record<number, string> = {
	0: "stereo",
	1: "5.1",
	2: "5.1.2",
	3: "5.1.4",
	4: "5.1.4 + LFE2 (BS.2051 E)",
	5: "7.1 (3+7+0, BS.2051 F)",
	6: "9.1.4 (BS.2051 G)",
	7: "22.2",
	8: "7.1",
	9: "7.1.4",
	10: "7.1.2",
	11: "3.1.2",
	12: "mono",
	13: "9.1.6",
};
const IAMF_PROFILES: Record<number, string> = { 0: "simple", 1: "base", 2: "base-enhanced" };

class ByteReader {
	pos: number;
	readonly view: DataView;
	readonly end: number;
	constructor(view: DataView, start: number, end: number) {
		this.view = view;
		this.pos = start;
		this.end = end;
	}
	get remaining() {
		return this.end - this.pos;
	}
	u8() {
		if (this.pos + 1 > this.end) throw new RangeError("truncated");
		return this.view.getUint8(this.pos++);
	}
	u16() {
		if (this.pos + 2 > this.end) throw new RangeError("truncated");
		const value = this.view.getUint16(this.pos);
		this.pos += 2;
		return value;
	}
	u32() {
		if (this.pos + 4 > this.end) throw new RangeError("truncated");
		const value = this.view.getUint32(this.pos);
		this.pos += 4;
		return value;
	}
	skip(n: number) {
		if (this.pos + n > this.end) throw new RangeError("truncated");
		this.pos += n;
	}
	fourcc() {
		const value = fourcc(this.view, this.pos);
		this.skip(4);
		return value;
	}
	leb128() {
		let value = 0;
		for (let i = 0; i < 8; i++) {
			const byte = this.u8();
			value += (byte & 0x7f) * 2 ** (7 * i);
			if (!(byte & 0x80)) return value;
		}
		return value;
	}
	/** Null-terminated UTF-8 string. */
	cstring() {
		const start = this.pos;
		while (this.u8() !== 0) {
			/* scan */
		}
		return utf8.decode(
			new Uint8Array(this.view.buffer, this.view.byteOffset + start, this.pos - start - 1),
		);
	}
}

function iamfParamDefinition(r: ByteReader) {
	r.leb128(); // parameter_id
	r.leb128(); // parameter_rate
	const mode = r.u8() >> 7;
	if (mode === 0) {
		r.leb128(); // duration
		const constantSubblockDuration = r.leb128();
		if (constantSubblockDuration === 0) {
			const numSubblocks = r.leb128();
			for (let i = 0; i < numSubblocks; i++) r.leb128();
		}
	}
}

type IamfElement = { id: number; kind: string; layout: string; channels: number; detail?: string };

function iamfAudioElement(r: ByteReader): IamfElement {
	const id = r.leb128();
	const type = r.u8() >> 5;
	r.leb128(); // codec_config_id
	const numSubstreams = r.leb128();
	for (let i = 0; i < numSubstreams; i++) r.leb128();
	const numParameters = r.leb128();
	for (let i = 0; i < numParameters; i++) {
		const paramType = r.leb128();
		if (paramType === 1) {
			iamfParamDefinition(r);
			r.skip(2); // default demixing info + default_w
		} else if (paramType === 2) {
			iamfParamDefinition(r);
		} else {
			r.skip(r.leb128());
		}
	}

	if (type === 0) {
		const numLayers = r.u8() >> 5;
		const layers: string[] = [];
		let top = { name: "?", channels: 0 };
		for (let i = 0; i < numLayers; i++) {
			const byte = r.u8();
			const loudspeakerLayout = byte >> 4;
			const outputGainPresent = (byte >> 3) & 1;
			r.skip(2); // substream_count, coupled_substream_count
			if (outputGainPresent) r.skip(3);
			let layout = IAMF_LAYOUTS[loudspeakerLayout];
			if (loudspeakerLayout === 15) layout = IAMF_EXPANDED_LAYOUTS[r.u8()];
			top = layout ?? { name: `layout ${loudspeakerLayout}`, channels: 0 };
			layers.push(top.name);
		}
		const result: IamfElement = {
			id,
			kind: "channel-based",
			layout: top.name,
			channels: top.channels,
		};
		if (layers.length > 1) result.detail = `scalable layers: ${layers.join(" → ")}`;
		return result;
	}
	if (type === 1) {
		const mode = r.leb128();
		const outputChannelCount = r.u8();
		const order = Math.round(Math.sqrt(outputChannelCount) - 1);
		return {
			id,
			kind: "scene-based",
			layout: `ambisonics order ${order} (${mode === 0 ? "mono" : "projection"} mapping)`,
			channels: outputChannelCount,
		};
	}
	return { id, kind: `type ${type}`, layout: "unknown", channels: 0 };
}

function iamfMixPresentation(r: ByteReader) {
	const id = r.leb128();
	const countLabel = r.leb128();
	for (let i = 0; i < countLabel; i++) r.cstring(); // annotations_language
	for (let i = 0; i < countLabel; i++) r.cstring(); // localized_presentation_annotations
	const numSubMixes = r.leb128();
	const layouts: string[] = [];
	for (let s = 0; s < numSubMixes; s++) {
		const numAudioElements = r.leb128();
		for (let e = 0; e < numAudioElements; e++) {
			r.leb128(); // audio_element_id
			for (let i = 0; i < countLabel; i++) r.cstring();
			r.u8(); // headphones_rendering_mode + reserved
			r.skip(r.leb128()); // rendering_config_extension
			iamfParamDefinition(r); // element_mix_gain
			r.skip(2); // default_mix_gain
		}
		iamfParamDefinition(r); // output_mix_gain
		r.skip(2);
		const numLayouts = r.leb128();
		for (let l = 0; l < numLayouts; l++) {
			const byte = r.u8();
			const layoutType = byte >> 6;
			if (layoutType === 2) {
				const soundSystem = (byte >> 2) & 0x0f;
				layouts.push(IAMF_SOUND_SYSTEMS[soundSystem] ?? `sound system ${soundSystem}`);
			} else if (layoutType === 3) {
				layouts.push("binaural");
			} else {
				layouts.push(`layout type ${layoutType}`);
			}
			// loudness info
			const infoType = r.u8();
			r.skip(4); // integrated_loudness, digital_peak
			if (infoType & 1) r.skip(2);
			if (infoType & 2) {
				const numAnchored = r.u8();
				r.skip(numAnchored * 3);
			}
			if (infoType & 0xfc) r.skip(r.leb128());
		}
	}
	return { id, layouts };
}

/** Parses the descriptor OBUs inside an `iacb` box body. */
function parseIacb(view: DataView, start: number, end: number): Partial<AudioStreamInfo> {
	const details: string[] = [];
	const result: Partial<AudioStreamInfo> = { codec: "IAMF", details };
	const r = new ByteReader(view, start, end);
	try {
		r.u8(); // configurationVersion
		r.leb128(); // configOBUs_size — the box bounds us already
	} catch {
		return result;
	}

	const elements: IamfElement[] = [];
	let innerCodec = "";
	let sampleRate: number | undefined;

	while (r.remaining > 0) {
		let header: number;
		let obuSize: number;
		try {
			header = r.u8();
			obuSize = r.leb128();
		} catch {
			break;
		}
		const type = header >> 3;
		const obuEnd = Math.min(r.pos + obuSize, end);
		const obu = new ByteReader(view, r.pos, obuEnd);
		if (header & 0x02) {
			obu.leb128();
			obu.leb128(); // trimming
		}
		if (header & 0x01) obu.skip(obu.leb128()); // extension header
		try {
			if (type === 31) {
				obu.fourcc(); // 'iamf'
				const primary = obu.u8();
				const additional = obu.u8();
				details.push(
					`profile: ${IAMF_PROFILES[primary] ?? primary}${additional !== primary ? ` (additional: ${IAMF_PROFILES[additional] ?? additional})` : ""}`,
				);
			} else if (type === 0) {
				obu.leb128(); // codec_config_id
				const codecId = obu.fourcc();
				obu.leb128(); // num_samples_per_frame
				obu.skip(2); // audio_roll_distance
				if (codecId === "Opus") {
					obu.skip(4); // version, output_channel_count, pre_skip
					sampleRate = obu.u32();
					innerCodec = "Opus";
				} else if (codecId === "ipcm") {
					obu.skip(2);
					sampleRate = obu.u32();
					innerCodec = "PCM";
				} else if (codecId === "fLaC") {
					innerCodec = "FLAC";
				} else if (codecId === "mp4a") {
					innerCodec = "AAC";
				} else {
					innerCodec = codecId;
				}
			} else if (type === 1) {
				elements.push(iamfAudioElement(obu));
			} else if (type === 2) {
				const mix = iamfMixPresentation(obu);
				details.push(`mix presentation ${mix.id}: ${mix.layouts.join(", ") || "no layouts"}`);
			}
		} catch {
			details.push(`(could not fully parse OBU type ${type})`);
		}
		r.pos = obuEnd;
	}

	for (const element of elements) {
		details.push(
			`audio element ${element.id}: ${element.kind}, ${element.layout} (${element.channels} ch)${element.detail ? ` — ${element.detail}` : ""}`,
		);
	}
	if (innerCodec) result.codec = `IAMF (${innerCodec})`;
	if (sampleRate) result.sampleRate = sampleRate;
	if (elements.length > 0) {
		result.channels = elements.reduce((sum, element) => sum + element.channels, 0);
		result.layout = elements.map((element) => element.layout).join(" + ");
	}
	return result;
}

/* ---- sample entries --------------------------------------------------------------------------- */

const SAMPLE_ENTRY_NAMES: Record<string, string> = {
	mp4a: "MPEG-4 audio",
	Opus: "Opus",
	"ac-3": "AC-3",
	"ec-3": "E-AC-3",
	fLaC: "FLAC",
	ipcm: "PCM (integer)",
	fpcm: "PCM (float)",
	lpcm: "PCM",
	iamf: "IAMF",
	".mp3": "MP3",
	alac: "ALAC",
	enca: "encrypted audio",
};

function parseAudioSampleEntry(view: DataView, entry: Box): Partial<AudioStreamInfo> {
	const b = entry.bodyStart;
	const info: Partial<AudioStreamInfo> = {
		codec: SAMPLE_ENTRY_NAMES[entry.type] ?? entry.type,
		details: [],
	};
	if (b + 28 > entry.end) return info;

	const qtVersion = view.getUint16(b + 8);
	let channels = view.getUint16(b + 16);
	let sampleRate = view.getUint32(b + 24) >>> 16;
	let childStart = b + 28;
	if (qtVersion === 1) childStart += 16;
	if (qtVersion === 2) {
		// QuickTime v2 sound description: real values live after the base struct.
		sampleRate = Math.round(view.getFloat64(b + 32));
		channels = view.getUint32(b + 40);
		childStart += 36;
	}
	if (channels > 0) info.channels = channels;
	if (sampleRate > 0) info.sampleRate = sampleRate;

	for (const child of boxes(view, childStart, entry.end)) {
		try {
			if (child.type === "esds") {
				const esds = parseEsds(view, child.bodyStart, child.end);
				if (esds?.codec) info.codec = esds.codec;
				if (esds?.channels) info.channels = esds.channels;
				if (esds?.sampleRate) info.sampleRate = esds.sampleRate;
				if (esds?.objectTypeIndication === 0x6b || esds?.objectTypeIndication === 0x69)
					info.codec = "MP3";
			} else if (child.type === "dOps") {
				info.codec = "Opus";
				info.channels = view.getUint8(child.bodyStart + 1);
				const inputSampleRate = view.getUint32(child.bodyStart + 4);
				if (inputSampleRate) info.sampleRate = inputSampleRate;
				const family = view.getUint8(child.bodyStart + 10);
				if (family === 1) {
					const names: Record<number, string> = {
						3: "3.0",
						4: "quad",
						5: "5.0",
						6: "5.1",
						7: "6.1",
						8: "7.1",
					};
					const layout = names[info.channels];
					if (layout) info.layout = layout;
				}
			} else if (child.type === "dac3") {
				Object.assign(info, parseDac3(view, child.bodyStart));
			} else if (child.type === "dec3") {
				Object.assign(info, parseDec3(view, child.bodyStart));
			} else if (child.type === "dfLa") {
				// METADATA_BLOCK_HEADER (4) + STREAMINFO: sample rate 20 bits @ byte 10, channels-1 3 bits
				const s = child.bodyStart + 4 + 4;
				info.sampleRate =
					(view.getUint8(s + 10) << 12) |
					(view.getUint8(s + 11) << 4) |
					(view.getUint8(s + 12) >> 4);
				info.channels = ((view.getUint8(s + 12) >> 1) & 0x07) + 1;
			} else if (child.type === "iacb") {
				const iamf = parseIacb(view, child.bodyStart, child.end);
				Object.assign(info, iamf);
			} else if (child.type === "sinf") {
				const frma = findBox(view, child.bodyStart, child.end, "frma");
				if (frma)
					info.codec = `${SAMPLE_ENTRY_NAMES[fourcc(view, frma.bodyStart)] ?? fourcc(view, frma.bodyStart)} (encrypted)`;
			}
		} catch {
			info.details?.push(`(could not parse ${child.type} box)`);
		}
	}
	return info;
}

function parseMp4(bytes: Uint8Array): AudioStreamInfo {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const result: AudioStreamInfo = { container: "mp4", details: [], complete: false };

	let moov: Box | undefined;
	for (const box of boxes(view, 0, bytes.byteLength)) {
		if (box.type === "moov") {
			const declared = view.getUint32(box.start);
			const fullyPresent = declared !== 0 && box.start + declared <= bytes.byteLength;
			if (!fullyPresent) return result; // need more bytes
			moov = box;
			break;
		}
		if (box.type === "moof" || box.type === "mdat") break; // media without a moov first: give up
	}
	if (!moov) {
		// Either the moov hasn't arrived yet, or this isn't an init segment at all.
		const last = [...boxes(view, 0, bytes.byteLength)].pop();
		result.complete = last?.type === "moof" || last?.type === "mdat";
		return result;
	}

	result.complete = true;
	const tracks: Partial<AudioStreamInfo>[] = [];
	for (const trak of boxes(view, moov.bodyStart, moov.end)) {
		if (trak.type !== "trak") continue;
		const mdia = findBox(view, trak.bodyStart, trak.end, "mdia");
		if (!mdia) continue;
		const hdlr = findBox(view, mdia.bodyStart, mdia.end, "hdlr");
		if (!hdlr || fourcc(view, hdlr.bodyStart + 8) !== "soun") continue;
		const minf = findBox(view, mdia.bodyStart, mdia.end, "minf");
		const stbl = minf && findBox(view, minf.bodyStart, minf.end, "stbl");
		const stsd = stbl && findBox(view, stbl.bodyStart, stbl.end, "stsd");
		if (!stsd) continue;
		for (const entry of boxes(view, stsd.bodyStart + 8, stsd.end)) {
			tracks.push(parseAudioSampleEntry(view, entry));
			break; // first sample entry describes the track
		}
	}

	const first = tracks[0];
	if (!first) {
		result.details.push("no audio track in init segment");
		return result;
	}
	Object.assign(result, first);
	result.details = [...(first.details ?? [])];
	if (tracks.length > 1) {
		result.details.unshift(
			`${tracks.length} audio tracks; showing the first (${tracks
				.slice(1)
				.map((t) => `${t.codec ?? "?"} ${t.channels ?? "?"} ch`)
				.join(", ")} also present)`,
		);
	}
	return result;
}

/* ------------------------------------------------------------------------------------------- */
/* WebM / Matroska                                                                               */
/* ------------------------------------------------------------------------------------------- */

const EBML = {
	header: 0x1a45dfa3,
	segment: 0x18538067,
	tracks: 0x1654ae6b,
	trackEntry: 0xae,
	trackType: 0x83,
	codecId: 0x86,
	audio: 0xe1,
	channels: 0x9f,
	samplingFrequency: 0xb5,
	cluster: 0x1f43b675,
};

/** Reads an EBML variable-size integer. `keepMarker` for element IDs. */
function vint(view: DataView, pos: number, end: number, keepMarker: boolean) {
	if (pos >= end) return undefined;
	const first = view.getUint8(pos);
	let length = 1;
	let mask = 0x80;
	while (length <= 8 && !(first & mask)) {
		length++;
		mask >>= 1;
	}
	if (length > 8 || pos + length > end) return undefined;
	let value = keepMarker ? first : first & (mask - 1);
	let allOnes = (first & (mask - 1)) === mask - 1;
	for (let i = 1; i < length; i++) {
		const byte = view.getUint8(pos + i);
		value = value * 256 + byte;
		if (byte !== 0xff) allOnes = false;
	}
	return { value, length, unknown: !keepMarker && allOnes };
}

const MATROSKA_CODECS: Record<string, string> = {
	A_OPUS: "Opus",
	A_VORBIS: "Vorbis",
	A_AAC: "AAC",
	A_FLAC: "FLAC",
	A_AC3: "AC-3",
	A_EAC3: "E-AC-3",
	A_PCM: "PCM",
	A_MPEG: "MPEG audio",
	A_IAMF: "IAMF",
};

function parseWebm(bytes: Uint8Array): AudioStreamInfo {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const result: AudioStreamInfo = { container: "webm", details: [], complete: false };
	const end = bytes.byteLength;
	let sawTracks = false;

	const walk = (start: number, stop: number, depth: number): boolean => {
		let pos = start;
		while (pos < stop) {
			const id = vint(view, pos, stop, true);
			if (!id) return false;
			const size = vint(view, pos + id.length, stop, false);
			if (!size) return false;
			const bodyStart = pos + id.length + size.length;
			const bodyEnd = size.unknown ? stop : Math.min(bodyStart + size.value, stop);

			if (id.value === EBML.cluster) return true; // init segment is over
			if (id.value === EBML.segment || id.value === EBML.tracks) {
				if (id.value === EBML.tracks) {
					if (!size.unknown && bodyStart + size.value > end) return false; // need more bytes
					sawTracks = true;
				}
				if (walk(bodyStart, bodyEnd, depth + 1)) return true;
			} else if (id.value === EBML.trackEntry && depth >= 2) {
				const track: { type?: number; codec?: string; channels?: number; sampleRate?: number } = {};
				let p = bodyStart;
				while (p < bodyEnd) {
					const cid = vint(view, p, bodyEnd, true);
					const csize = cid && vint(view, p + cid.length, bodyEnd, false);
					if (!cid || !csize) break;
					const cs = p + cid.length + csize.length;
					const ce = Math.min(cs + csize.value, bodyEnd);
					if (cid.value === EBML.trackType) track.type = view.getUint8(cs);
					if (cid.value === EBML.codecId) track.codec = utf8.decode(bytes.subarray(cs, ce));
					if (cid.value === EBML.audio) {
						let a = cs;
						while (a < ce) {
							const aid = vint(view, a, ce, true);
							const asize = aid && vint(view, a + aid.length, ce, false);
							if (!aid || !asize) break;
							const as = a + aid.length + asize.length;
							if (aid.value === EBML.channels) {
								let n = 0;
								for (let i = 0; i < asize.value; i++) n = n * 256 + view.getUint8(as + i);
								track.channels = n;
							}
							if (aid.value === EBML.samplingFrequency) {
								track.sampleRate = Math.round(
									asize.value === 4 ? view.getFloat32(as) : view.getFloat64(as),
								);
							}
							a = as + asize.value;
						}
					}
					p = ce;
				}
				if (track.type === 2 && result.channels === undefined) {
					const codecKey = Object.keys(MATROSKA_CODECS).find((key) => track.codec?.startsWith(key));
					result.codec = (codecKey && MATROSKA_CODECS[codecKey]) || track.codec || "unknown";
					if (track.channels) result.channels = track.channels;
					if (track.sampleRate) result.sampleRate = track.sampleRate;
				}
			}
			if (size.unknown) return true;
			pos = bodyEnd;
		}
		return false;
	};

	const finished = walk(0, end, 0);
	result.complete = finished || (sawTracks && result.channels !== undefined);
	if (result.complete && result.channels === undefined)
		result.details.push("no audio track in init segment");
	return result;
}

/* ------------------------------------------------------------------------------------------- */
/* Raw elementary streams                                                                        */
/* ------------------------------------------------------------------------------------------- */

const MP3_SAMPLE_RATES: Record<number, number[]> = {
	3: [44100, 48000, 32000], // MPEG-1
	2: [22050, 24000, 16000], // MPEG-2
	0: [11025, 12000, 8000], // MPEG-2.5
};

function skipId3(bytes: Uint8Array) {
	if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
		const size =
			((bytes[6] ?? 0) << 21) | ((bytes[7] ?? 0) << 14) | ((bytes[8] ?? 0) << 7) | (bytes[9] ?? 0);
		return 10 + size;
	}
	return 0;
}

function parseAdts(bytes: Uint8Array, offset: number): AudioStreamInfo {
	const result: AudioStreamInfo = {
		container: "adts",
		codec: "AAC (ADTS)",
		details: [],
		complete: false,
	};
	if (offset + 7 > bytes.length) return result;
	const b2 = bytes[offset + 2] ?? 0;
	const b3 = bytes[offset + 3] ?? 0;
	const profile = b2 >> 6;
	const sampleRate = AAC_SAMPLE_RATES[(b2 >> 2) & 0x0f];
	const channelConfiguration = ((b2 & 0x01) << 2) | (b3 >> 6);
	result.codec = ["AAC Main", "AAC-LC", "AAC SSR", "AAC LTP"][profile] ?? "AAC";
	if (sampleRate) result.sampleRate = sampleRate;
	const channels = AAC_CHANNELS[channelConfiguration];
	if (channels) result.channels = channels;
	else result.details.push("channel configuration signalled in-band (PCE)");
	result.complete = true;
	return result;
}

function parseMp3(bytes: Uint8Array, offset: number): AudioStreamInfo {
	const result: AudioStreamInfo = { container: "mp3", codec: "MP3", details: [], complete: false };
	if (offset + 4 > bytes.length) return result;
	const b1 = bytes[offset + 1] ?? 0;
	const b2 = bytes[offset + 2] ?? 0;
	const b3 = bytes[offset + 3] ?? 0;
	const version = (b1 >> 3) & 0x03;
	const layer = (b1 >> 1) & 0x03;
	result.codec = `MPEG-${version === 3 ? 1 : version === 2 ? 2 : "2.5"} Layer ${["", "III", "II", "I"][layer]}`;
	const sampleRate = MP3_SAMPLE_RATES[version]?.[(b2 >> 2) & 0x03];
	if (sampleRate) result.sampleRate = sampleRate;
	const mode = b3 >> 6;
	result.channels = mode === 3 ? 1 : 2;
	result.layout = ["stereo", "joint stereo", "dual channel", "mono"][mode] ?? "stereo";
	result.complete = true;
	return result;
}

const WAV_SPEAKER_NAMES = [
	"FL",
	"FR",
	"FC",
	"LFE",
	"BL",
	"BR",
	"FLC",
	"FRC",
	"BC",
	"SL",
	"SR",
	"TC",
	"TFL",
	"TFC",
	"TFR",
	"TBL",
	"TBC",
	"TBR",
];

function parseWav(bytes: Uint8Array): AudioStreamInfo {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const result: AudioStreamInfo = {
		container: "wav",
		codec: "PCM (WAV)",
		details: [],
		complete: false,
	};
	let pos = 12;
	while (pos + 8 <= bytes.byteLength) {
		const id = fourcc(view, pos);
		const size = view.getUint32(pos + 4, true);
		if (id === "fmt ") {
			if (pos + 8 + 16 > bytes.byteLength) return result;
			const format = view.getUint16(pos + 8, true);
			result.channels = view.getUint16(pos + 10, true);
			result.sampleRate = view.getUint32(pos + 12, true);
			const bits = view.getUint16(pos + 22, true);
			const formats: Record<number, string> = { 1: "PCM", 3: "IEEE float", 65534: "extensible" };
			result.codec = `${bits}-bit ${formats[format] ?? `format 0x${format.toString(16)}`} (WAV)`;
			if (format === 0xfffe && size >= 40 && pos + 8 + 40 <= bytes.byteLength) {
				const mask = view.getUint32(pos + 28, true);
				const speakers = WAV_SPEAKER_NAMES.filter((_, i) => mask & (1 << i));
				if (speakers.length) result.details.push(`channel mask: ${speakers.join(" ")}`);
				const sub = view.getUint16(pos + 32, true);
				if (sub === 3) result.codec = `${bits}-bit IEEE float (WAV extensible)`;
			}
			result.complete = true;
			return result;
		}
		pos += 8 + size + (size & 1);
	}
	return result;
}

/* ------------------------------------------------------------------------------------------- */

/**
 * Inspects the first bytes of a stream. Call again with more bytes while `complete` is false.
 */
export function inspectInitSegment(bytes: Uint8Array): AudioStreamInfo {
	if (bytes.byteLength < 12) return { container: "unknown", details: [], complete: false };
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	if (MP4_TOP_LEVEL.has(fourcc(view, 4))) return parseMp4(bytes);
	if (view.getUint32(0) === EBML.header) return parseWebm(bytes);
	if (fourcc(view, 0) === "RIFF" && fourcc(view, 8) === "WAVE") return parseWav(bytes);

	const offset = skipId3(bytes);
	if (offset + 4 > bytes.byteLength) return { container: "unknown", details: [], complete: false };
	const b0 = bytes[offset] ?? 0;
	const b1 = bytes[offset + 1] ?? 0;
	if (b0 === 0xff && (b1 & 0xf6) === 0xf0) return parseAdts(bytes, offset);
	if (b0 === 0xff && (b1 & 0xe0) === 0xe0 && (b1 & 0x06) !== 0) return parseMp3(bytes, offset);

	return { container: "unknown", details: ["unrecognised container"], complete: true };
}

/** One-line summary, e.g. "IAMF (Opus) · 7.1.4 · 12 ch · 48 kHz". */
export function summarizeStream(info: AudioStreamInfo) {
	const parts: string[] = [];
	if (info.codec) parts.push(info.codec);
	if (info.channels !== undefined) {
		parts.push(
			info.layout && !/^\d+ ch/.test(info.layout)
				? `${info.layout} · ${info.channels} ch`
				: describeChannels(info.channels),
		);
	} else if (info.layout) {
		parts.push(info.layout);
	}
	if (info.sampleRate) parts.push(`${(info.sampleRate / 1000).toString().replace(/\.0$/, "")} kHz`);
	return parts.join(" · ") || "unknown";
}
