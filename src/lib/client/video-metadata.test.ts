import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { stripVideoMetadata } from './video-metadata';

// --- A tiny ISO-BMFF writer -------------------------------------------------

/** Box types are bytes, not UTF-8: "©xyz" starts with 0xA9. */
function latin1(text: string): Uint8Array {
	return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

const utf8 = (text: string) => new TextEncoder().encode(text);

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function u16(n: number) {
	const out = new Uint8Array(2);
	new DataView(out.buffer).setUint16(0, n);
	return out;
}

function u32(n: number) {
	const out = new Uint8Array(4);
	new DataView(out.buffer).setUint32(0, n);
	return out;
}

function u64(n: number) {
	const out = new Uint8Array(8);
	new DataView(out.buffer).setBigUint64(0, BigInt(n));
	return out;
}

const filler = (length: number, value = 0x11) => new Uint8Array(length).fill(value);

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
	const body = concat(payload);
	return concat([u32(8 + body.length), latin1(type), body]);
}

/** A box with size = 1 and a 64-bit largesize. */
function largeBox(type: string, ...payload: Uint8Array[]): Uint8Array {
	const body = concat(payload);
	return concat([u32(1), latin1(type), u64(16 + body.length), body]);
}

function fullBox(type: string, version: number, flags: number, ...payload: Uint8Array[]) {
	return box(
		type,
		new Uint8Array([version, flags >> 16, (flags >> 8) & 0xff, flags & 0xff]),
		...payload
	);
}

// --- Sample movies ----------------------------------------------------------

const GPS = '+59.9139+010.7522/';
const ISO6709 = 'com.apple.quicktime.location.ISO6709';
const CREATION_KEY = 'com.apple.quicktime.creationdate';
const CREATION_DATE = '2024-06-01T12:00:00+0200';
const XMP_GPS = '<exif:GPSLatitude>59,54.834N</exif:GPSLatitude>';
const SECRETS = [GPS, ISO6709, CREATION_KEY, CREATION_DATE, XMP_GPS];

/** 2024-06-01 in seconds since 1904, as QuickTime counts. */
const CREATED = 3_800_044_800;
const MODIFIED = CREATED + 60;
/** Needs both 32-bit halves in a version 1 (64-bit) field. */
const CREATED_64 = 2 ** 32 + 12_345;

const XMP_UUID = new Uint8Array([
	0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac
]);

/** mdat payload with something that looks like a box header inside, which must stay as-is. */
const MDAT_PAYLOAD = concat([
	u32(16),
	latin1('udta'),
	filler(8, 0xab),
	Uint8Array.from({ length: 200 }, (_, i) => (i * 37 + 11) & 0xff)
]);

function mvhd(version: 0 | 1, created: number, modified: number) {
	const rest = filler(80); // rate, volume, matrix, next_track_ID …
	return version === 1
		? fullBox('mvhd', 1, 0, u64(created), u64(modified), u32(600), u64(1800), rest)
		: fullBox('mvhd', 0, 0, u32(created), u32(modified), u32(600), u32(1800), rest);
}

function quicktimeKeys() {
	const key = (name: string) => concat([u32(8 + name.length), latin1('mdta'), latin1(name)]);
	return box('keys', u32(0), u32(2), key(ISO6709), key(CREATION_KEY));
}

function ilst() {
	const item = (index: number, value: string) =>
		box(String.fromCharCode(0, 0, 0, index), box('data', u32(1), u32(0), utf8(value)));
	return box('ilst', item(1, `${GPS}012.000/`), item(2, CREATION_DATE));
}

const hdlr = () => fullBox('hdlr', 0, 0, u32(0), latin1('mdta'), filler(12, 0), u16(0));

/** `meta` as an MP4 FullBox (version/flags first) or QuickTime-style (children right away). */
function meta(style: 'mp4' | 'quicktime') {
	return style === 'mp4'
		? fullBox('meta', 0, 0, hdlr(), quicktimeKeys(), ilst())
		: box('meta', hdlr(), quicktimeKeys(), ilst());
}

function udta() {
	return box(
		'udta',
		box('©xyz', u16(GPS.length), u16(0x15c7), latin1(GPS)),
		box('©day', utf8(CREATION_DATE))
	);
}

const stbl = () =>
	box(
		'stbl',
		fullBox('stsd', 0, 0, u32(1), box('avc1', filler(78, 0x22))),
		fullBox('stts', 0, 0, u32(1), u32(3), u32(600)),
		fullBox('stco', 0, 0, u32(1), u32(4242))
	);

function trak() {
	return box(
		'trak',
		fullBox('tkhd', 0, 3, u32(CREATED), u32(MODIFIED), u32(1), u32(0), u32(1800), filler(60)),
		box('edts', fullBox('elst', 0, 0, u32(1), u32(1800), u32(0), u32(0x10000))),
		box(
			'mdia',
			fullBox('mdhd', 0, 0, u32(CREATED), u32(MODIFIED), u32(600), u32(1800), u16(0x55c4), u16(0)),
			fullBox('hdlr', 0, 0, u32(0), latin1('vide'), filler(12, 0), u16(0)),
			box('minf', fullBox('vmhd', 0, 1, filler(8, 0)), stbl())
		),
		udta()
	);
}

interface Movie {
	version?: 0 | 1;
	metaStyle?: 'mp4' | 'quicktime';
}

/** ftyp, moov (mvhd, trak, udta, meta, XMP uuid), a top-level XMP uuid and mdat. */
function movie({ version = 0, metaStyle = 'mp4' }: Movie = {}): Uint8Array {
	const created = version === 1 ? CREATED_64 : CREATED;
	return concat([
		box('ftyp', latin1('qt  '), u32(0), latin1('qt  ')),
		box(
			'moov',
			mvhd(version, created, created + 60),
			trak(),
			udta(),
			meta(metaStyle),
			box('uuid', XMP_UUID, utf8(`<rdf:RDF>${XMP_GPS}</rdf:RDF>`))
		),
		box('uuid', XMP_UUID, utf8(`<rdf:RDF>${XMP_GPS}</rdf:RDF>`)),
		box('mdat', MDAT_PAYLOAD)
	]);
}

// --- Helpers for the assertions ---------------------------------------------

function strip(input: Uint8Array) {
	const result = stripVideoMetadata(input.slice().buffer);
	return { bytes: new Uint8Array(result.buffer), stripped: result.stripped };
}

const asLatin1 = (bytes: Uint8Array) => String.fromCharCode(...bytes);

/** Start offsets of every box of `type`, found by scanning for the type (before `end`). */
function boxStarts(bytes: Uint8Array, type: string, end = bytes.length): number[] {
	const text = asLatin1(bytes.subarray(0, end));
	const starts: number[] = [];
	for (let i = text.indexOf(type); i !== -1; i = text.indexOf(type, i + 1)) starts.push(i - 4);
	return starts;
}

function boxAt(bytes: Uint8Array, start: number) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return { size: view.getUint32(start), type: asLatin1(bytes.subarray(start + 4, start + 8)) };
}

function readUint(bytes: Uint8Array, offset: number, width: 4 | 8): number {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return width === 4 ? view.getUint32(offset) : Number(view.getBigUint64(offset));
}

const isZero = (bytes: Uint8Array) => bytes.every((b) => b === 0);

function mdatStart(bytes: Uint8Array) {
	const starts = boxStarts(bytes, 'mdat');
	return starts[starts.length - 1];
}

// --- Tests --------------------------------------------------------------------

describe('stripVideoMetadata', () => {
	it('keeps the length and removes every location and date string', () => {
		const input = movie();
		const { bytes, stripped } = strip(input);
		expect(bytes.length).toBe(input.length);
		const before = asLatin1(input);
		const after = asLatin1(bytes);
		for (const secret of SECRETS) {
			expect(before).toContain(secret);
			expect(after).not.toContain(secret);
		}
		// moov/udta, trak/udta, moov/meta, moov/uuid, top-level uuid + mvhd, tkhd, mdhd.
		expect(stripped).toBe(8);
	});

	it('turns udta, meta and uuid boxes into zero-filled free boxes of the same size', () => {
		const input = movie();
		const { bytes } = strip(input);
		const end = mdatStart(input);
		const wiped = ['udta', 'meta', 'uuid'].flatMap((type) => boxStarts(input, type, end));
		expect(wiped).toHaveLength(5);
		for (const start of wiped) {
			const { size } = boxAt(input, start);
			expect(boxAt(bytes, start)).toEqual({ size, type: 'free' });
			expect(isZero(bytes.subarray(start + 8, start + size))).toBe(true);
		}
	});

	it('leaves ftyp, edit lists, sample tables and mdat byte-for-byte unchanged', () => {
		const input = movie();
		const { bytes } = strip(input);
		const end = mdatStart(input);
		for (const type of ['ftyp', 'edts', 'stbl']) {
			const starts = boxStarts(input, type, end);
			expect(starts).toHaveLength(1);
			const { size } = boxAt(input, starts[0]);
			expect(bytes.subarray(starts[0], starts[0] + size)).toEqual(
				input.subarray(starts[0], starts[0] + size)
			);
		}
		expect(bytes.subarray(end)).toEqual(input.subarray(end));
	});

	it('zeroes 32-bit creation and modification times in mvhd, tkhd and mdhd', () => {
		const input = movie({ version: 0 });
		const { bytes } = strip(input);
		for (const type of ['mvhd', 'tkhd', 'mdhd']) {
			const [start] = boxStarts(input, type);
			expect(readUint(input, start + 12, 4)).toBe(CREATED);
			expect(readUint(input, start + 16, 4)).toBe(MODIFIED);
			expect(readUint(bytes, start + 12, 4)).toBe(0);
			expect(readUint(bytes, start + 16, 4)).toBe(0);
			// Everything after the two timestamps is untouched.
			const { size } = boxAt(input, start);
			expect(bytes.subarray(start + 20, start + size)).toEqual(
				input.subarray(start + 20, start + size)
			);
		}
		const [mvhdStart] = boxStarts(bytes, 'mvhd');
		expect(readUint(bytes, mvhdStart + 20, 4)).toBe(600); // timescale
		expect(readUint(bytes, mvhdStart + 24, 4)).toBe(1800); // duration
	});

	it('zeroes 64-bit times in a version 1 mvhd and keeps timescale and duration', () => {
		const input = movie({ version: 1 });
		const { bytes } = strip(input);
		const [start] = boxStarts(input, 'mvhd');
		expect(readUint(input, start + 12, 8)).toBe(CREATED_64);
		expect(isZero(bytes.subarray(start + 12, start + 28))).toBe(true);
		expect(readUint(bytes, start + 28, 4)).toBe(600);
		expect(readUint(bytes, start + 32, 8)).toBe(1800);
		expect(bytes.length).toBe(input.length);
	});

	it('wipes a QuickTime-style meta box without version/flags', () => {
		const input = movie({ metaStyle: 'quicktime' });
		const { bytes } = strip(input);
		const [start] = boxStarts(input, 'meta');
		const { size } = boxAt(input, start);
		expect(boxAt(bytes, start)).toEqual({ size, type: 'free' });
		expect(isZero(bytes.subarray(start + 8, start + size))).toBe(true);
		expect(asLatin1(bytes)).not.toContain(ISO6709);
	});

	it('walks boxes with a 64-bit largesize and keeps their headers', () => {
		const input = concat([
			box('ftyp', latin1('isom'), u32(0)),
			largeBox('mdat', MDAT_PAYLOAD),
			largeBox('moov', mvhd(0, CREATED, MODIFIED), largeBox('udta', box('©xyz', latin1(GPS))))
		]);
		const { bytes, stripped } = strip(input);
		expect(stripped).toBe(2);
		expect(bytes.length).toBe(input.length);
		expect(asLatin1(bytes)).not.toContain(GPS);
		// The first "udta" is the fake header inside mdat.
		const udta = boxStarts(input, 'udta')[1];
		// size = 1, type renamed, largesize kept, payload zeroed.
		expect(readUint(bytes, udta, 4)).toBe(1);
		expect(asLatin1(bytes.subarray(udta + 4, udta + 8))).toBe('free');
		expect(bytes.subarray(udta + 8, udta + 16)).toEqual(input.subarray(udta + 8, udta + 16));
		expect(isZero(bytes.subarray(udta + 16))).toBe(true);
		const mdat = boxStarts(input, 'mdat')[0];
		expect(bytes.subarray(mdat, mdat + 16 + MDAT_PAYLOAD.length)).toEqual(
			input.subarray(mdat, mdat + 16 + MDAT_PAYLOAD.length)
		);
	});

	it('wipes a top-level prft box (wall-clock capture time)', () => {
		const prft = fullBox('prft', 1, 0, u32(1), u64(CREATED_64), u64(1800));
		const input = concat([box('ftyp', latin1('iso6'), u32(0)), prft, box('mdat', MDAT_PAYLOAD)]);
		const { bytes, stripped } = strip(input);
		const [start] = boxStarts(input, 'prft');
		expect(stripped).toBe(1);
		expect(boxAt(bytes, start)).toEqual({ size: prft.length, type: 'free' });
		expect(isZero(bytes.subarray(start + 8, start + prft.length))).toBe(true);
	});

	it('handles a last box with size 0 (extends to the end of the file)', () => {
		const moov = box('moov', udta());
		new DataView(moov.buffer).setUint32(0, 0);
		const input = concat([box('ftyp', latin1('isom'), u32(0)), box('mdat', MDAT_PAYLOAD), moov]);
		const { bytes, stripped } = strip(input);
		expect(stripped).toBe(1);
		expect(asLatin1(bytes)).not.toContain(GPS);
	});

	it('also finds metadata when moov comes after mdat', () => {
		const input = concat([
			box('ftyp', latin1('isom'), u32(0)),
			box('mdat', MDAT_PAYLOAD),
			box('moov', udta())
		]);
		expect(asLatin1(strip(input).bytes)).not.toContain(GPS);
	});

	it('does not modify the input buffer', () => {
		const input = movie();
		const buffer = input.slice().buffer;
		const result = stripVideoMetadata(buffer);
		expect(result.buffer).not.toBe(buffer);
		expect(new Uint8Array(buffer)).toEqual(input);
	});

	it('returns the same buffer when there is nothing to strip', () => {
		const clean = strip(movie()).bytes;
		const buffer = clean.slice().buffer;
		const result = stripVideoMetadata(buffer);
		expect(result).toEqual({ buffer, stripped: 0 });
		expect(result.buffer).toBe(buffer);
	});

	it('returns WebM unchanged', () => {
		const webm = concat([
			new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]),
			latin1('webm'),
			utf8(GPS)
		]);
		const buffer = webm.slice().buffer;
		const result = stripVideoMetadata(buffer);
		expect(result.buffer).toBe(buffer);
		expect(result.stripped).toBe(0);
		expect(new Uint8Array(result.buffer)).toEqual(webm);
	});

	it('returns the real WebM fixture unchanged', () => {
		const clip = new Uint8Array(
			readFileSync(new URL('../../../tests/fixtures/clip.webm', import.meta.url))
		);
		const buffer = clip.slice().buffer;
		const result = stripVideoMetadata(buffer);
		expect(result.buffer).toBe(buffer);
		expect(result.stripped).toBe(0);
		expect(new Uint8Array(result.buffer)).toEqual(clip);
	});

	it('returns non-video data and empty input unchanged', () => {
		for (const data of [new Uint8Array(0), new Uint8Array([1, 2, 3]), utf8('not a video at all')]) {
			const buffer = data.slice().buffer;
			expect(stripVideoMetadata(buffer)).toEqual({ buffer, stripped: 0 });
		}
	});

	it('stops at a malformed box but keeps what it found before it', () => {
		const broken = concat([u32(0xfffffff0), latin1('trak'), filler(8)]);
		const moov = box('moov', udta(), meta('mp4'), broken, udta());
		const input = concat([
			box('ftyp', latin1('isom'), u32(0)),
			moov,
			box('uuid', XMP_UUID, utf8(XMP_GPS))
		]);
		const { bytes, stripped } = strip(input);
		expect(bytes.length).toBe(input.length);
		// udta and meta before the broken box, and the uuid after moov, are wiped. The udta
		// behind the broken box can't be found (its offset is unknown), so it stays.
		expect(stripped).toBe(3);
		expect(asLatin1(bytes)).not.toContain(ISO6709);
		expect(asLatin1(bytes)).not.toContain(XMP_GPS);
		expect(boxStarts(bytes, 'udta')).toHaveLength(1);
	});

	it('never throws on truncated files and keeps their length', () => {
		const input = movie();
		for (let length = 0; length <= input.length; length++) {
			const truncated = input.slice(0, length);
			const { bytes } = strip(truncated);
			expect(bytes.length).toBe(length);
		}
	});

	it('never throws on deeply nested boxes', () => {
		const depth = 100_000;
		const input = new Uint8Array(8 * depth);
		const view = new DataView(input.buffer);
		for (let i = 0; i < depth; i++) {
			view.setUint32(i * 8, (depth - i) * 8);
			input.set(latin1(i === 0 ? 'moov' : 'trak'), i * 8 + 4);
		}
		expect(strip(input).bytes.length).toBe(input.length);
	});

	it('never throws on random or corrupted input and keeps the length', () => {
		const sample = movie();
		fc.assert(
			fc.property(fc.uint8Array({ maxLength: 512 }), (data) => {
				const withHeader = concat([box('ftyp', latin1('isom')), data]);
				for (const input of [data, withHeader])
					expect(strip(input).bytes.length).toBe(input.length);
			})
		);
		fc.assert(
			fc.property(
				fc.array(fc.tuple(fc.nat(sample.length - 1), fc.integer({ min: 0, max: 255 })), {
					minLength: 1,
					maxLength: 8
				}),
				(changes) => {
					const corrupted = sample.slice();
					for (const [index, value] of changes) corrupted[index] = value;
					expect(strip(corrupted).bytes.length).toBe(sample.length);
				}
			)
		);
	});
});
