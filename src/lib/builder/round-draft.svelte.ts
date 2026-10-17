import { reverseGeocode, type Place } from '$lib/client/geocode';
import { compressImage, readExif, type ExifHints } from '$lib/client/image';
import { CAPTION_MAX_LENGTH, LABEL_MAX_LENGTH, isValidLatLng, type MediaType } from '$lib/game';
import type { LatLng } from '$lib/map/types';
import type { Id } from '../../convex/_generated/dataModel';
import { nominatim } from './nominatim';
import type { SavedRound } from './types';
import { VideoProblem, isVideoFile, prepareVideo } from './video';

export interface YearRange {
	yearMin: number;
	yearMax: number;
}

export interface MapFocus extends LatLng {
	zoom?: number;
}

/** The answer part of `rounds.create` / `rounds.update`. */
export interface RoundAnswer {
	answerYear: number;
	answerLat: number;
	answerLng: number;
	answerLabel?: string;
	caption?: string;
	roundSeconds?: number;
}

/** Media that has been uploaded for the current file, reused if saving is retried. */
export interface UploadedMedia {
	media: Blob;
	imageId: Id<'_storage'>;
	posterId?: Id<'_storage'>;
}

const REVERSE_GEOCODE_DELAY_MS = 1200;
const IMAGE_ERROR = 'Klarte ikke å lese bildet. Prøv en JPEG- eller PNG-fil.';

/** Decoding many 12-megapixel photos at once can exhaust memory; do two at a time. */
function limit(max: number) {
	let active = 0;
	const waiting: (() => void)[] = [];
	return async function run<T>(task: () => Promise<T>): Promise<T> {
		if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
		active++;
		try {
			return await task();
		} finally {
			active--;
			waiting.shift()?.();
		}
	};
}

const mediaSlots = limit(2);
let counter = 0;

/**
 * Editable state for one round: a new upload (draft card) or a saved round
 * being edited. Each instance is independent; call `dispose()` when done.
 */
export class RoundDraft {
	readonly key = `draft-${++counter}`;
	readonly roundId: Id<'rounds'> | null = null;
	readonly savedImageId: Id<'_storage'> | null = null;
	readonly savedPosterId: Id<'_storage'> | null = null;
	readonly savedMediaType: MediaType = 'image';

	fileName = $state('');
	mediaType = $state<MediaType>('image');
	/** New media to upload: the compressed image, or the original video file. */
	media = $state.raw<Blob | null>(null);
	/** Poster frame for a new video. */
	poster = $state.raw<Blob | null>(null);
	/** Image (or video poster) shown in the editor. */
	previewUrl = $state<string | null>(null);
	videoUrl = $state<string | null>(null);
	duration = $state<number | null>(null);
	processing = $state(false);
	mediaError = $state<string | null>(null);
	mediaWarning = $state<string | null>(null);
	exif = $state.raw<ExifHints | null>(null);
	yearFromExif = $state(false);
	positionFromExif = $state(false);

	year = $state<number | null>(null);
	lat = $state<number | null>(null);
	lng = $state<number | null>(null);
	label = $state('');
	/** The label came from a place search or map lookup, so a new pin may replace it. */
	labelAuto = $state(false);
	labelLoading = $state(false);
	caption = $state('');
	/** '' = the game's default; otherwise seconds as a string (for the native select). */
	roundSeconds = $state('');
	saving = $state(false);
	/** The map pans here whenever this changes (search result, EXIF position). */
	focus = $state.raw<MapFocus | null>(null);

	uploaded: UploadedMedia | null = null;

	#objectUrls: string[] = [];
	#disposed = false;
	#loadToken = 0;
	#reverseTimer: ReturnType<typeof setTimeout> | undefined;
	#reverseAbort: AbortController | null = null;

	constructor(round?: SavedRound) {
		if (!round) return;
		this.roundId = round._id;
		this.savedImageId = round.imageId;
		this.savedPosterId = round.posterId;
		this.savedMediaType = round.mediaType;
		this.mediaType = round.mediaType;
		this.previewUrl = round.imageUrl;
		this.videoUrl = round.videoUrl;
		this.year = round.answerYear;
		this.lat = round.answerLat;
		this.lng = round.answerLng;
		this.label = round.answerLabel ?? '';
		this.caption = round.caption ?? '';
		this.roundSeconds = round.roundSeconds === null ? '' : String(round.roundSeconds);
	}

	get hasMedia(): boolean {
		return this.media !== null || this.savedImageId !== null;
	}

	get isVideo(): boolean {
		return this.mediaType === 'video';
	}

	get hasPosition(): boolean {
		return this.lat !== null && this.lng !== null && isValidLatLng(this.lat, this.lng);
	}

	get labelReplaceable(): boolean {
		return this.label.trim() === '' || this.labelAuto;
	}

	yearError({ yearMin, yearMax }: YearRange): string | null {
		if (this.year === null) return null;
		if (!Number.isInteger(this.year)) return 'Skriv et helt årstall.';
		if (this.year < yearMin || this.year > yearMax)
			return `Året må være mellom ${yearMin} og ${yearMax}.`;
		return null;
	}

	/** What still blocks saving, as short Norwegian phrases. */
	missing(range: YearRange): string[] {
		const out: string[] = [];
		if (!this.hasMedia) out.push('bilde eller video');
		if (this.year === null) out.push('år');
		else if (this.yearError(range)) out.push('gyldig år');
		if (!this.hasPosition) out.push('plassering på kartet');
		return out;
	}

	isReady(range: YearRange): boolean {
		return !this.processing && !this.saving && this.missing(range).length === 0;
	}

	answer(): RoundAnswer {
		if (this.year === null || this.lat === null || this.lng === null)
			throw new Error('Round is not complete');
		const out: RoundAnswer = { answerYear: this.year, answerLat: this.lat, answerLng: this.lng };
		const label = this.label.trim().slice(0, LABEL_MAX_LENGTH);
		const caption = this.caption.trim().slice(0, CAPTION_MAX_LENGTH);
		if (label) out.answerLabel = label;
		if (caption) out.caption = caption;
		if (this.roundSeconds !== '') out.roundSeconds = Number(this.roundSeconds);
		return out;
	}

	setYear(value: unknown) {
		this.year = typeof value === 'number' && Number.isFinite(value) ? value : null;
		this.yearFromExif = false;
	}

	setLabel(value: string) {
		this.label = value;
		this.labelAuto = false;
		this.#cancelReverse();
	}

	/** A click on the map. Suggests a place name if the label is empty or was suggested. */
	placePin({ lat, lng }: LatLng) {
		this.lat = lat;
		this.lng = lng;
		this.positionFromExif = false;
		if (this.labelReplaceable) this.#scheduleReverse();
	}

	applyPlace(place: Place) {
		this.#cancelReverse();
		this.lat = place.lat;
		this.lng = place.lng;
		this.positionFromExif = false;
		if (this.labelReplaceable) {
			this.label = place.label.slice(0, LABEL_MAX_LENGTH);
			this.labelAuto = true;
		}
		this.focus = { lat: place.lat, lng: place.lng };
	}

	/** Reads an image (EXIF + compression) or a video (limits + poster) into this draft. */
	async loadFile(file: File, range: YearRange) {
		const token = ++this.#loadToken;
		const stale = () => this.#disposed || token !== this.#loadToken;
		this.processing = true;
		this.mediaError = null;
		if (!this.hasMedia) this.fileName = file.name;
		try {
			if (isVideoFile(file)) {
				const video = await mediaSlots(() => prepareVideo(file));
				if (stale()) return;
				this.#setMedia('video', video.file, video.poster);
				this.duration = video.duration;
				this.mediaWarning = video.warning;
				this.exif = null;
			} else {
				const [hints, image] = await mediaSlots(() =>
					Promise.all([readExif(file), compressImage(file)])
				);
				if (stale()) return;
				this.#setMedia('image', image.blob, null);
				this.#applyExif(hints, range);
			}
			this.fileName = file.name;
		} catch (error) {
			if (stale()) return;
			this.mediaError = error instanceof VideoProblem ? error.message : IMAGE_ERROR;
		} finally {
			if (token === this.#loadToken) this.processing = false;
		}
	}

	dispose() {
		this.#disposed = true;
		this.#cancelReverse();
		for (const url of this.#objectUrls) URL.revokeObjectURL(url);
		this.#objectUrls = [];
	}

	#setMedia(type: MediaType, media: Blob, poster: Blob | null) {
		for (const url of this.#objectUrls) URL.revokeObjectURL(url);
		this.#objectUrls = [];
		const track = (blob: Blob) => {
			const url = URL.createObjectURL(blob);
			this.#objectUrls.push(url);
			return url;
		};
		this.mediaType = type;
		this.media = media;
		this.poster = poster;
		this.uploaded = null;
		this.mediaWarning = null;
		this.duration = null;
		if (type === 'video') {
			this.videoUrl = track(media);
			this.previewUrl = poster ? track(poster) : null;
		} else {
			this.videoUrl = null;
			this.previewUrl = track(media);
		}
	}

	/** EXIF only fills fields that are still empty; the host can always override. */
	#applyExif(hints: ExifHints, { yearMin, yearMax }: YearRange) {
		this.exif = hints;
		if (
			this.year === null &&
			hints.year !== undefined &&
			hints.year >= yearMin &&
			hints.year <= yearMax
		) {
			this.year = hints.year;
			this.yearFromExif = true;
		}
		const { lat, lng } = hints;
		if (
			!this.hasPosition &&
			lat !== undefined &&
			lng !== undefined &&
			isValidLatLng(lat, lng) &&
			!(lat === 0 && lng === 0)
		) {
			this.lat = lat;
			this.lng = lng;
			this.positionFromExif = true;
			this.focus = { lat, lng, zoom: 12 };
		}
	}

	#scheduleReverse() {
		this.#cancelReverse();
		const { lat, lng } = this;
		if (lat === null || lng === null) return;
		this.#reverseTimer = setTimeout(async () => {
			const controller = new AbortController();
			this.#reverseAbort = controller;
			this.labelLoading = true;
			try {
				const place = await nominatim(
					() => reverseGeocode(lat, lng, controller.signal),
					controller.signal
				);
				if (
					place &&
					!controller.signal.aborted &&
					this.lat === lat &&
					this.lng === lng &&
					this.labelReplaceable
				) {
					this.label = place.label.slice(0, LABEL_MAX_LENGTH);
					this.labelAuto = true;
				}
			} catch {
				// A missing suggestion is fine; the label is optional.
			} finally {
				if (this.#reverseAbort === controller) {
					this.#reverseAbort = null;
					this.labelLoading = false;
				}
			}
		}, REVERSE_GEOCODE_DELAY_MS);
	}

	#cancelReverse() {
		clearTimeout(this.#reverseTimer);
		this.#reverseAbort?.abort();
		this.#reverseAbort = null;
		this.labelLoading = false;
	}
}
