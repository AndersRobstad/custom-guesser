import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devices, expect, test, type BrowserContext, type Page } from '@playwright/test';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const TILE = readFileSync(join(FIXTURES, 'tile.png'));

async function mockNetwork(context: BrowserContext) {
	await context.route('https://tile.openstreetmap.org/**', (route) =>
		route.fulfill({ status: 200, contentType: 'image/png', body: TILE })
	);
	await context.route('https://nominatim.openstreetmap.org/**', (route) =>
		route.fulfill({
			json: route.request().url().includes('/reverse')
				? {
						place_id: 1,
						lat: '35.3687',
						lon: '24.4736',
						name: 'Rethymno',
						display_name: 'Rethymno',
						address: { state: 'Kreta' }
					}
				: [
						{
							place_id: 7,
							lat: '35.3687',
							lon: '24.4736',
							name: 'Rethymno',
							display_name: 'Rethymno, Kreta, Hellas',
							address: { state: 'Kreta', country: 'Hellas' }
						}
					]
		})
	);
}

function watchConsole(page: Page, who: string, errors: string[]) {
	page.on('console', (msg) => msg.type() === 'error' && errors.push(`${who}: ${msg.text()}`));
	page.on('pageerror', (err) => errors.push(`${who}: ${err.message}`));
}

test('a video round autoplays on the TV and loads on demand on the phone', async ({ browser }) => {
	test.setTimeout(120_000);
	const errors: string[] = [];

	const hostContext = await browser.newContext({ viewport: { width: 1366, height: 820 } });
	await mockNetwork(hostContext);
	const host = await hostContext.newPage();
	watchConsole(host, 'host', errors);

	await host.goto('/create');
	await host.getByRole('button', { name: 'Nytt spill' }).click();
	await host.waitForURL(/\/create\/[^/]+$/);
	await host.getByTestId('image-upload').setInputFiles(join(FIXTURES, 'clip.webm'));
	const draft = host.getByTestId('draft-round').first();
	await expect(draft).toBeVisible();
	await draft.getByTestId('place-search').fill('Rethymno');
	await draft.getByTestId('place-result').first().click();
	await draft.getByTestId('round-year').fill('2004');
	await draft.getByTestId('save-round').click();
	await expect(host.getByTestId('round-item')).toHaveCount(1);
	await host.getByTestId('start-session').click();
	await host.waitForURL(/\/host\/[^/]+$/);
	const code = (await host.getByTestId('join-code').innerText()).trim();

	const phoneContext = await browser.newContext({ ...devices['iPhone 13'] });
	await mockNetwork(phoneContext);
	const phone = await phoneContext.newPage();
	watchConsole(phone, 'phone', errors);
	await phone.goto(`/join?code=${code}`);
	await phone.getByTestId('join-name').fill('Kari');
	await phone.getByTestId('join-submit').click();
	await expect(phone.getByTestId('player-lobby')).toBeVisible();

	await host.getByTestId('start-game').click();

	// TV: the clip plays straight away, muted and looping.
	const tvMedia = host.getByTestId('round-media');
	await expect(tvMedia).toHaveAttribute('data-media-type', 'video');
	const tvVideo = tvMedia.locator('video');
	await expect(tvVideo).toHaveAttribute('src', /.+/);
	await expect
		.poll(() => tvVideo.evaluate((v: HTMLVideoElement) => !v.paused && v.muted && v.loop))
		.toBe(true);

	// Phone: only the poster frame until the player asks for the clip.
	const phoneMedia = phone.getByTestId('round-media');
	await expect(phoneMedia).toHaveAttribute('data-media-type', 'video');
	await expect(phoneMedia.locator('video')).toHaveCount(0);
	await expect(phoneMedia.locator('img')).toHaveAttribute('src', /.+/);
	await phone.getByTestId('play-video').click();
	await expect(phoneMedia.locator('video')).toBeVisible();

	// The round still plays like any other.
	await expect(phone.getByTestId('guess-map')).toHaveAttribute('data-map-ready', 'true');
	await phone.getByTestId('guess-map').click({ position: { x: 200, y: 80 } });
	await phone.getByTestId('year-input').fill('2004');
	await phone.getByTestId('submit-guess').click();
	await expect(host.getByTestId('host-reveal')).toBeVisible();
	await expect(phone.getByTestId('player-reveal')).toBeVisible();
	// nb-NO groups digits with a (narrow) no-break space.
	await expect(phone.getByTestId('year-score')).toHaveText(/\b5\s000\b/);

	expect(errors, errors.join('\n')).toEqual([]);
});
