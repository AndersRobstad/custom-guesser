#!/usr/bin/env node
/**
 * Generates tests/fixtures/clip.webm: a 3 s, 320×240 VP9 clip with a moving bar
 * and a big "4", for the video-round E2E test. Frames are drawn in headless
 * Chromium and encoded with the ffmpeg build that Playwright installs
 * (`npx playwright install chromium` also fetches it). No network needed.
 * Usage: node scripts/generate-video-fixture.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'clip.webm');

function findFfmpeg() {
	const roots = [
		process.env.PLAYWRIGHT_BROWSERS_PATH,
		join(homedir(), 'Library', 'Caches', 'ms-playwright'),
		join(homedir(), '.cache', 'ms-playwright'),
		join(homedir(), 'AppData', 'Local', 'ms-playwright')
	].filter(Boolean);
	for (const root of roots) {
		if (!existsSync(root)) continue;
		for (const dir of readdirSync(root).filter((d) => d.startsWith('ffmpeg'))) {
			for (const bin of ['ffmpeg-mac', 'ffmpeg-linux', 'ffmpeg-win64.exe']) {
				const path = join(root, dir, bin);
				if (existsSync(path)) return path;
			}
		}
	}
	throw new Error('Fant ikke ffmpeg fra Playwright. Kjør `npx playwright install chromium`.');
}

const FPS = 10;
const SECONDS = 3;

const browser = await chromium.launch();
const page = await browser.newPage();
const frames = await page.evaluate(
	({ count }) => {
		const canvas = document.createElement('canvas');
		canvas.width = 320;
		canvas.height = 240;
		const ctx = canvas.getContext('2d');
		const result = [];
		for (let i = 0; i < count; i++) {
			ctx.fillStyle = '#1f6f8b';
			ctx.fillRect(0, 0, 320, 240);
			ctx.fillStyle = '#ffd23f';
			ctx.fillRect((i * 9) % 320, 200, 40, 16);
			ctx.fillStyle = '#ffffff';
			ctx.font = 'bold 140px sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText('4', 160, 160);
			result.push(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
		}
		return result;
	},
	{ count: FPS * SECONDS }
);
await browser.close();

// Playwright's ffmpeg has no pipe protocol, so hand it the frames as one MJPEG file.
const tmp = mkdtempSync(join(tmpdir(), 'glimt-clip-'));
const framesFile = join(tmp, 'frames.mjpeg');
writeFileSync(framesFile, Buffer.concat(frames.map((f) => Buffer.from(f, 'base64'))));

const ffmpeg = spawn(
	findFfmpeg(),
	[
		'-y',
		'-f',
		'image2pipe',
		'-c:v',
		'mjpeg',
		'-framerate',
		String(FPS),
		'-i',
		`file:${framesFile}`,
		'-c:v',
		'libvpx-vp9',
		'-b:v',
		'200k',
		'-pix_fmt',
		'yuv420p',
		`file:${out}`
	],
	{ stdio: ['ignore', 'ignore', 'pipe'] }
);
let stderr = '';
ffmpeg.stderr.on('data', (d) => (stderr += d));
const code = await new Promise((resolve) => ffmpeg.on('close', resolve));
rmSync(tmp, { recursive: true, force: true });
if (code !== 0) {
	console.error(stderr);
	process.exit(code ?? 1);
}
console.log(`Wrote ${out}`);
