/**
 * Video handling for the builder. Videos are uploaded as-is (no re-encoding in
 * the browser), so we only check the limits and grab a JPEG poster frame that
 * phones can show before the player taps play.
 */
import { MAX_IMAGE_SIDE } from '$lib/client/image';
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
	/** The original file, re-typed if the browser didn't know its MIME type. */
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

function toJpeg(canvas: HTMLCanvasElement, quality: number) {
	return new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
			'image/jpeg',
			quality
		)
	);
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
	return toJpeg(canvas, 0.82);
}

/**
 * Checks size, type and length of a video and grabs a poster frame at
 * min(1 s, duration / 2). Throws `VideoProblem` with a Norwegian message.
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
	const file =
		input.type === type
			? input
			: new File([input], input.name, { type, lastModified: input.lastModified });

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
