#!/usr/bin/env node
/**
 * Generates deterministic test images for the E2E suite (no network needed):
 *   tests/fixtures/round-1.png … round-3.png  – solid colors with a big digit
 *   tests/fixtures/tile.png                   – a neutral 256×256 map tile
 * Usage: node scripts/generate-fixtures.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
mkdirSync(outDir, { recursive: true });

// 5×7 bitmap glyphs for the digits we need.
const GLYPHS = {
	1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
	2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
	3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110']
};

function hex(color) {
	const n = parseInt(color.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makePng(width, height, paint) {
	const png = new PNG({ width, height });
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const [r, g, b] = paint(x, y);
			const i = (width * y + x) << 2;
			png.data[i] = r;
			png.data[i + 1] = g;
			png.data[i + 2] = b;
			png.data[i + 3] = 255;
		}
	}
	return PNG.sync.write(png);
}

function roundImage(digit, background) {
	const width = 800;
	const height = 600;
	const bg = hex(background);
	const fg = [255, 255, 255];
	const glyph = GLYPHS[digit];
	const scale = 50;
	const gw = 5 * scale;
	const gh = 7 * scale;
	const ox = (width - gw) / 2;
	const oy = (height - gh) / 2;
	return makePng(width, height, (x, y) => {
		const gx = Math.floor((x - ox) / scale);
		const gy = Math.floor((y - oy) / scale);
		const inGlyph = gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && glyph[gy][gx] === '1';
		return inGlyph ? fg : bg;
	});
}

const rounds = [
	[1, '#c0392b'],
	[2, '#16a085'],
	[3, '#8e44ad']
];
for (const [digit, color] of rounds) {
	writeFileSync(join(outDir, `round-${digit}.png`), roundImage(digit, color));
}

// A pale tile with a faint grid so the map is visibly a map in screenshots.
writeFileSync(
	join(outDir, 'tile.png'),
	makePng(256, 256, (x, y) => (x % 64 === 0 || y % 64 === 0 ? [200, 210, 220] : [232, 236, 240]))
);

console.log(`Wrote fixtures to ${outDir}`);
