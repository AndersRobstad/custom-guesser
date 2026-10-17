import exifr from 'exifr';

export const MAX_IMAGE_SIDE = 1600;
export const TARGET_IMAGE_BYTES = 400 * 1024;

export interface ExifHints {
	year?: number;
	lat?: number;
	lng?: number;
}

/** Reads capture year and GPS position from the original file (before compression strips EXIF). */
export async function readExif(file: Blob): Promise<ExifHints> {
	const [gps, meta] = await Promise.all([
		exifr.gps(file).catch(() => null),
		exifr.parse(file, ['DateTimeOriginal', 'CreateDate']).catch(() => null)
	]);
	const hints: ExifHints = {};
	const date: unknown = meta?.DateTimeOriginal ?? meta?.CreateDate;
	if (date instanceof Date && !Number.isNaN(date.getTime())) hints.year = date.getFullYear();
	if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
		hints.lat = gps.latitude;
		hints.lng = gps.longitude;
	}
	return hints;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
	try {
		return await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		const url = URL.createObjectURL(file);
		try {
			const img = new Image();
			img.src = url;
			await img.decode();
			return img;
		} finally {
			URL.revokeObjectURL(url);
		}
	}
}

/** Encodes the canvas as a JPEG. */
export function toBlob(canvas: HTMLCanvasElement, quality: number) {
	return new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
			'image/jpeg',
			quality
		)
	);
}

export interface CompressedImage {
	blob: Blob;
	width: number;
	height: number;
}

/**
 * Downscales to max 1600 px on the long side and re-encodes as JPEG, lowering
 * quality (and then size) until the file is about 400 KB or less.
 */
export async function compressImage(file: Blob): Promise<CompressedImage> {
	const source = await decode(file);
	const srcW = 'naturalWidth' in source ? source.naturalWidth : source.width;
	const srcH = 'naturalHeight' in source ? source.naturalHeight : source.height;
	let scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(srcW, srcH));
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not supported');

	let blob: Blob | null = null;
	for (let pass = 0; pass < 3; pass++) {
		canvas.width = Math.max(1, Math.round(srcW * scale));
		canvas.height = Math.max(1, Math.round(srcH * scale));
		ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
		for (const quality of [0.86, 0.78, 0.7, 0.62, 0.54]) {
			blob = await toBlob(canvas, quality);
			if (blob.size <= TARGET_IMAGE_BYTES) break;
		}
		if (blob && blob.size <= TARGET_IMAGE_BYTES) break;
		scale *= 0.8;
	}
	if ('close' in source) source.close();
	return { blob: blob!, width: canvas.width, height: canvas.height };
}

/** Uploads a blob to a Convex upload URL and returns the storage id. */
export async function uploadToConvex(uploadUrl: string, blob: Blob): Promise<string> {
	const res = await fetch(uploadUrl, {
		method: 'POST',
		headers: { 'Content-Type': blob.type || 'image/jpeg' },
		body: blob
	});
	if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
	const { storageId } = (await res.json()) as { storageId: string };
	return storageId;
}
