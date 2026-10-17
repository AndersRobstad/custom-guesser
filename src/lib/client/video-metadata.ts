/**
 * Removes location and capture-date metadata from MP4/MOV (ISO-BMFF) videos
 * before upload, because players get the clip's URL and could read the answer
 * from it (e.g. with exiftool).
 *
 * The file keeps its exact size and every box keeps its offset, so chunk
 * offsets in `stco`/`co64` stay valid and nothing has to be re-muxed:
 * - every `udta` and `meta` box (at any walked level) and every top-level or
 *   `moov`-level `uuid` box (XMP) is renamed to `free` and zero-filled. Phones
 *   put GPS and dates here: `©xyz`/`©day` in `udta`, `com.apple.quicktime.*`
 *   keys in `meta`, XMP in `uuid`. The whole box is wiped, so it doesn't matter
 *   whether a `meta` is an MP4 FullBox (version/flags first) or QuickTime-style;
 * - a top-level `prft` box (wall-clock capture time) is wiped the same way;
 * - creation_time and modification_time in `mvhd`, `tkhd` and `mdhd` are zeroed.
 *
 * `mdat` and the sample tables are never touched, so a 50 MB clip costs one
 * walk over a few dozen box headers plus one native copy.
 *
 * Not covered: WebM/Matroska is returned unchanged (browser and phone WebM
 * recordings rarely carry GPS), and timed metadata tracks whose samples live
 * inside `mdat` (e.g. GoPro GPMF telemetry) are left as they are.
 */

/** What `stripVideoMetadata` did. */
export interface StrippedVideo {
	/** The cleaned file: the input buffer itself when nothing changed, otherwise a copy. */
	buffer: ArrayBuffer;
	/** Number of boxes that were changed (wiped, or had their timestamps zeroed). */
	stripped: number;
}

/** First four bytes of every EBML (WebM/Matroska) file. */
const EBML_MAGIC = 0x1a45dfa3;

/** Box types an MP4/MOV file can plausibly start with (old QuickTime files may lack `ftyp`). */
const FIRST_BOX_TYPES = new Set([
	'ftyp',
	'styp',
	'moov',
	'mdat',
	'free',
	'skip',
	'wide',
	'pnot',
	'uuid',
	'sidx',
	'moof'
]);

/** Boxes that only hold other boxes and may contain metadata or header boxes further down. */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'moof', 'traf']);

/** Wiped wherever they are found. */
const WIPE_ANYWHERE = new Set(['udta', 'meta']);

/** Full boxes that start with creation_time and modification_time after version/flags. */
const TIMESTAMPED = new Set(['mvhd', 'tkhd', 'mdhd']);

/** Real files nest about five levels deep; the limit stops crafted input from overflowing the stack. */
const MAX_DEPTH = 16;

interface Box {
	type: string;
	start: number;
	/** Bytes taken by size + type (+ largesize), i.e. where a wiped box's payload begins. */
	sizeHeader: number;
	/** Where the children (or fields) begin: after the `uuid` user type if there is one. */
	contentStart: number;
	end: number;
}

/** A pending change: optionally rename the box at `renameAt` to `free`, then zero [from, to). */
interface Edit {
	renameAt?: number;
	from: number;
	to: number;
}

function fourcc(view: DataView, offset: number): string {
	return String.fromCharCode(
		view.getUint8(offset),
		view.getUint8(offset + 1),
		view.getUint8(offset + 2),
		view.getUint8(offset + 3)
	);
}

/** Reads the box header at `offset`, or null if it is malformed or runs past `limit`. */
function readBox(view: DataView, offset: number, limit: number): Box | null {
	if (offset + 8 > limit) return null;
	const size32 = view.getUint32(offset);
	const type = fourcc(view, offset + 4);
	let sizeHeader = 8;
	let size: number;
	if (size32 === 1) {
		if (offset + 16 > limit) return null;
		size = view.getUint32(offset + 8) * 2 ** 32 + view.getUint32(offset + 12);
		sizeHeader = 16;
	} else if (size32 === 0) {
		size = limit - offset; // Extends to the end of the file (or of the parent box).
	} else {
		size = size32;
	}
	const contentStart = offset + sizeHeader + (type === 'uuid' ? 16 : 0);
	if (size < contentStart - offset || size > limit - offset) return null;
	return { type, start: offset, sizeHeader, contentStart, end: offset + size };
}

/** Zeroes creation_time and modification_time if they are set (version 0: 32-bit, 1: 64-bit). */
function timestampEdit(view: DataView, box: Box): Edit | null {
	if (box.contentStart + 4 > box.end) return null;
	const version = view.getUint8(box.contentStart);
	if (version > 1) return null;
	const from = box.contentStart + 4;
	const to = from + (version === 1 ? 16 : 8);
	if (to > box.end) return null;
	for (let i = from; i < to; i++) {
		if (view.getUint8(i) !== 0) return { from, to };
	}
	return null;
}

function walk(
	view: DataView,
	start: number,
	end: number,
	parent: string | null,
	depth: number,
	edits: Edit[]
) {
	let offset = start;
	while (offset < end) {
		const box = readBox(view, offset, end);
		if (!box) return; // Malformed or truncated: keep what this level has so far.
		const { type } = box;
		const wipe =
			WIPE_ANYWHERE.has(type) ||
			(type === 'uuid' && (parent === null || parent === 'moov')) ||
			(type === 'prft' && parent === null);
		if (wipe) {
			edits.push({ renameAt: box.start + 4, from: box.start + box.sizeHeader, to: box.end });
		} else if (TIMESTAMPED.has(type)) {
			const edit = timestampEdit(view, box);
			if (edit) edits.push(edit);
		} else if (CONTAINERS.has(type) && depth < MAX_DEPTH) {
			walk(view, box.contentStart, box.end, type, depth + 1, edits);
		}
		offset = box.end;
	}
}

/** True for data that starts like an MP4/MOV file. */
function isIsoBmff(buffer: ArrayBuffer): boolean {
	if (buffer.byteLength < 8) return false;
	const view = new DataView(buffer);
	if (view.getUint32(0) === EBML_MAGIC) return false;
	return FIRST_BOX_TYPES.has(fourcc(view, 4)) && readBox(view, 0, buffer.byteLength) !== null;
}

/**
 * Returns `buffer` without location/date metadata (see the module comment).
 * Same length and box layout as the input; the input is never modified. Data
 * that isn't MP4/MOV (e.g. WebM) comes back unchanged with `stripped: 0`.
 * Never throws: on a malformed or truncated box it stops walking that level.
 */
export function stripVideoMetadata(buffer: ArrayBuffer): StrippedVideo {
	if (!isIsoBmff(buffer)) return { buffer, stripped: 0 };
	const edits: Edit[] = [];
	walk(new DataView(buffer), 0, buffer.byteLength, null, 0, edits);
	if (edits.length === 0) return { buffer, stripped: 0 };

	const out = buffer.slice(0);
	const bytes = new Uint8Array(out);
	for (const { renameAt, from, to } of edits) {
		if (renameAt !== undefined) bytes.set([0x66, 0x72, 0x65, 0x65], renameAt); // "free"
		bytes.fill(0, from, to);
	}
	return { buffer: out, stripped: edits.length };
}
