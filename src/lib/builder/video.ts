/**
 * Video handling for the builder. Videos are not re-encoded in the browser, so
 * we only check the limits, strip location/date metadata (players can download
 * the clip) and grab a JPEG poster frame that phones can show before the
 * player taps play.
 */
import { MAX_IMAGE_SIDE, toBlob } from '$lib/client/image';
import { stripVideoMetadata } from '$lib/client/video-metadata';
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, VIDEO_MIME_TYPES } from '$lib/game';

export type VideoMimeType = (typeof VIDEO_MIME_TYPES)[number];

/** Recorded durations are a little imprecise; don't reject a 30.2 s clip. */
const DURATION_TOLERANCE_S = 0.5;
const LOAD_TIMEOUT_MS = 20_000;

export const VIDEO_ACCEPT = VIDEO_MIME_TYPES.join(',');
export const MEDIA_ACCEPT = `image/*,${VIDEO_ACCEPT}`;

export const PLAYBACK_WARNING =
	'Denne videoen kan kanskje ikke spilles av på alle enheter. MP4 (H.264) fungerer best.';
const UNDECODABLE =
	'Denne videoen kan ikke spilles av i nettleseren din, så vi kan ikke lage et stillbilde. Prøv en MP4-fil (H.264).';
const UNREADABLE = 'Klarte ikke å lese videofilen. Prøv igjen, eller velg en annen fil.';

const EXTENSION_TYPES: Record<string, VideoMimeType> = {
	mp4: 'video/mp4',
	m4v: 'video/mp4',
	webm: 'video/webm',
	mov: 'video/quicktime',
	qt: 'video/quicktime'
};

/** A problem with a video the host should see as-is (already Norwegian). */
export class VideoProblem extends Error {}

function extension(name: string) {
	return name.split('.').pop()?.toLowerCase() ?? '';
}

/** The supported MIME type for a file, falling back to the extension when `type` is empty. */
export function videoMimeType(file: File): VideoMimeType | null {
	const known = VIDEO_MIME_TYPES.find((t) => t === file.type);
	if (known) return known;
	if (file.type && file.type !== 'application/octet-stream') return null;
	return EXTENSION_TYPES[extension(file.name)] ?? null;
}

export function isVideoFile(file: File): boolean {
	return file.type.startsWith('video/') || videoMimeType(file) !== null;
}

export function isImageFile(file: File): boolean {
	return (
		file.type.startsWith('image/') ||
		/^(jpe?g|png|gif|webp|avif|heic|heif|bmp)$/.test(extension(file.name))
	);
}

/** "12 s" */
export function formatDuration(seconds: number): string {
	return `${Math.max(1, Math.round(seconds))} s`;
}

export interface PreparedVideo {
	/**
	 * The file to upload: the original without location/date metadata, re-typed
	 * if the browser didn't know its MIME type.
	 */
	file: File;
	duration: number;
	poster: Blob;
	/** Non-blocking note, e.g. when this browser can't vouch for the format. */
	warning: string | null;
}

/** Resolves once `ready()` holds, re-checking on the given events; rejects on error/timeout. */
function waitFor(video: HTMLVideoElement, events: string[], ready: () => boolean) {
	if (ready()) return Promise.resolve();
	return new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			clearTimeout(timer);
			for (const name of events) video.removeEventListener(name, check);
			video.removeEventListener('error', fail);
		};
		const check = () => {
			if (!ready()) return;
			cleanup();
			resolve();
		};
		const fail = () => {
			cleanup();
			reject(new Error('Video could not be loaded'));
		};
		const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
		for (const name of events) video.addEventListener(name, check);
		video.addEventListener('error', fail);
	});
}

const hasDuration = (video: HTMLVideoElement) =>
	Number.isFinite(video.duration) && video.duration > 0;

async function resolveDuration(video: HTMLVideoElement): Promise<number> {
	if (hasDuration(video)) return video.duration;
	// MediaRecorder WebM files often report Infinity until the end has been read.
	video.currentTime = 1e9;
	await waitFor(video, ['durationchange', 'timeupdate', 'seeked'], () => hasDuration(video));
	return video.duration;
}

async function seek(video: HTMLVideoElement, time: number) {
	const arrived = () => !video.seeking && Math.abs(video.currentTime - time) < 0.05;
	video.currentTime = time;
	await waitFor(video, ['seeked'], arrived);
	await waitFor(video, ['loadeddata', 'canplay'], () => video.readyState >= 2);
}

async function grabFrame(video: HTMLVideoElement, time: number): Promise<Blob> {
	await seek(video, time);
	const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(video.videoWidth, video.videoHeight));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
	canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not supported');
	ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
	return toBlob(canvas, 0.82);
}

/**
 * The video with GPS position and capture dates removed from its MP4/MOV
 * metadata (see `stripVideoMetadata`), typed as `type`. Same size and content
 * type as the original, so the upload limits still apply unchanged.
 */
async function withoutMetadata(input: File, type: VideoMimeType): Promise<File> {
	let original: ArrayBuffer;
	try {
		original = await input.arrayBuffer();
	} catch {
		// Uploading the untouched file could reveal the answer, so don't.
		throw new VideoProblem(UNREADABLE);
	}
	const { buffer } = stripVideoMetadata(original);
	if (buffer === original && input.type === type) return input;
	return new File([buffer], input.name, { type, lastModified: input.lastModified });
}

/**
 * Checks size, type and length of a video, strips its location/date metadata
 * and grabs a poster frame at min(1 s, duration / 2). Throws `VideoProblem`
 * with a Norwegian message.
 */
export async function prepareVideo(input: File): Promise<PreparedVideo> {
	const type = videoMimeType(input);
	if (!type) throw new VideoProblem('Denne videotypen støttes ikke. Bruk MP4, WebM eller MOV.');
	if (input.size > MAX_VIDEO_BYTES) {
		const mb = Math.ceil(input.size / 1024 / 1024);
		throw new VideoProblem(
			`Videoen er ${mb} MB. Maks ${MAX_VIDEO_BYTES / 1024 / 1024} MB – prøv et kortere klipp.`
		);
	}
	// Stripped before the browser loads it, so the poster and duration come from the file we upload.
	const file = await withoutMetadata(input, type);

	const url = URL.createObjectURL(file);
	const video = document.createElement('video');
	video.muted = true;
	video.playsInline = true;
	video.preload = 'metadata';
	video.setAttribute('aria-hidden', 'true');
	// Kept in the document (but invisible) because some browsers won't decode
	// frames for detached media elements.
	video.style.cssText =
		'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
	document.body.append(video);

	try {
		const canPlay = video.canPlayType(type) !== '';
		video.src = url;
		await waitFor(video, ['loadedmetadata'], () => video.readyState >= 1);
		const duration = await resolveDuration(video);
		if (duration > MAX_VIDEO_SECONDS + DURATION_TOLERANCE_S) {
			throw new VideoProblem(
				`Videoen er ${Math.round(duration)} sekunder lang. Maks ${MAX_VIDEO_SECONDS} sekunder.`
			);
		}
		if (!video.videoWidth || !video.videoHeight) throw new VideoProblem(UNDECODABLE);
		const poster = await grabFrame(video, Math.min(1, duration / 2));
		return { file, duration, poster, warning: canPlay ? null : PLAYBACK_WARNING };
	} catch (error) {
		if (error instanceof VideoProblem) throw error;
		throw new VideoProblem(UNDECODABLE);
	} finally {
		video.removeAttribute('src');
		video.load();
		video.remove();
		URL.revokeObjectURL(url);
	}
}
