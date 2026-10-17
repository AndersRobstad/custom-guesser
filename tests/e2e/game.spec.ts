import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	devices,
	expect,
	test,
	type Browser,
	type BrowserContext,
	type Page
} from '@playwright/test';
import { presetScoring, scoreGuess } from '../../src/lib/scoring';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const SCREENSHOTS = join(import.meta.dirname, '..', '..', 'docs', 'screenshots');
const TILE = readFileSync(join(FIXTURES, 'tile.png'));

/** Known answers. The place search is mocked, so these coordinates are exact. */
const ROUNDS = [
	{
		file: 'round-1.png',
		query: 'Rethymno',
		label: 'Rethymno, Kreta',
		lat: 35.3687,
		lng: 24.4736,
		year: 2004,
		seconds: ''
	},
	{
		file: 'round-2.png',
		query: 'Oslo',
		label: 'Oslo, Norge',
		lat: 59.9139,
		lng: 10.7522,
		year: 2012,
		seconds: '5'
	},
	{
		file: 'round-3.png',
		query: 'Bergen',
		label: 'Bergen, Vestland',
		lat: 60.3913,
		lng: 5.3221,
		year: 2019,
		seconds: ''
	}
];
const PLAYERS = ['Kari', 'Ola', 'Per'];
/** The game uses the default "Europa" preset. */
const SCORING = presetScoring('europe');

type Guess = { lat: number; lng: number; year: number };

const consoleErrors: string[] = [];

/** Serve map tiles and place search locally so the test never touches OpenStreetMap. */
async function mockNetwork(context: BrowserContext) {
	await context.route('https://tile.openstreetmap.org/**', (route) =>
		route.fulfill({ status: 200, contentType: 'image/png', body: TILE })
	);
	await context.route('https://nominatim.openstreetmap.org/**', (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.startsWith('/reverse')) {
			return route.fulfill({
				json: {
					place_id: 1,
					lat: url.searchParams.get('lat'),
					lon: url.searchParams.get('lon'),
					name: 'Et sted',
					display_name: 'Et sted',
					address: { country: 'Norge' }
				}
			});
		}
		const q = (url.searchParams.get('q') ?? '').toLowerCase();
		const hits = ROUNDS.filter(
			(r) => r.query.toLowerCase().startsWith(q) || q.startsWith(r.query.toLowerCase())
		);
		return route.fulfill({
			json: hits.map((r, i) => {
				const [name, region] = r.label.split(', ');
				return {
					place_id: 100 + i,
					lat: String(r.lat),
					lon: String(r.lng),
					name,
					display_name: `${r.label}, Europa`,
					address: { state: region, country: region }
				};
			})
		});
	});
}

async function newContext(browser: Browser, mobile: boolean) {
	const context = await browser.newContext(
		mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1366, height: 820 } }
	);
	await mockNetwork(context);
	return context;
}

function watchConsole(page: Page, who: string) {
	page.on('console', (msg) => {
		if (msg.type() === 'error') consoleErrors.push(`${who}: ${msg.text()}`);
	});
	page.on('pageerror', (err) => consoleErrors.push(`${who}: ${err.message}`));
}

/** Taps the guess map at a position and returns the exact pin the app recorded. */
async function guess(page: Page, x: number, y: number, year: number): Promise<Guess> {
	await expect(page.getByTestId('guess-screen')).toBeVisible();
	const map = page.getByTestId('guess-map');
	// Leaflet loads lazily; a tap before it's ready places no pin.
	await expect(map).toHaveAttribute('data-map-ready', 'true');
	await map.click({ position: { x, y } });
	await expect(map).toHaveAttribute('data-pin-lat', /.+/);
	await page.getByTestId('year-input').fill(String(year));
	const lat = Number(await map.getAttribute('data-pin-lat'));
	const lng = Number(await map.getAttribute('data-pin-lng'));
	await page.getByTestId('submit-guess').click();
	// The last answer reveals the round immediately, so either screen means "sent".
	await expect(
		page.getByTestId('guess-submitted').or(page.getByTestId('player-reveal'))
	).toBeVisible();
	return { lat, lng, year };
}

function expectedScore(g: Guess, roundIndex: number) {
	const r = ROUNDS[roundIndex];
	return scoreGuess(g, { lat: r.lat, lng: r.lng, year: r.year }, SCORING).total;
}

async function finalStandings(page: Page) {
	const rows = page.getByTestId('final-standings').getByTestId('standing-row');
	return rows.evaluateAll((els) =>
		els.map((el) => [el.getAttribute('data-player-name'), Number(el.getAttribute('data-total'))])
	);
}

test('a host and three phones play a full three-round game', async ({ browser }) => {
	test.setTimeout(240_000);

	// --- 1. Host builds a game with three rounds and starts a session -------------------------
	const hostContext = await newContext(browser, false);
	const host = await hostContext.newPage();
	watchConsole(host, 'host');

	await host.goto('/create');
	await host.getByRole('button', { name: 'Nytt spill' }).click();
	await host.waitForURL(/\/create\/[^/]+$/);
	const title = host.getByLabel('Tittel');
	await title.fill('Hvor og når er Anders (E2E)');
	await title.blur();

	await host.getByTestId('image-upload').setInputFiles(ROUNDS.map((r) => join(FIXTURES, r.file)));
	await expect(host.getByTestId('draft-round')).toHaveCount(3);

	for (const [i, round] of ROUNDS.entries()) {
		const draft = host.getByTestId('draft-round').first();
		await draft.getByTestId('place-search').fill(round.query);
		await draft.getByTestId('place-result').first().click();
		await draft.getByTestId('round-year').fill(String(round.year));
		await draft.getByTestId('round-seconds').selectOption(round.seconds);
		await draft.getByTestId('save-round').click();
		await expect(host.getByTestId('round-item')).toHaveCount(i + 1);
	}
	await expect(host.getByTestId('draft-round')).toHaveCount(0);

	await host.getByTestId('start-session').click();
	await host.waitForURL(/\/host\/[^/]+$/);
	const code = (await host.getByTestId('join-code').innerText()).trim();
	expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

	// --- 2. Three phones join with the code; the lobby shows them within 2 s ------------------
	const phones: Page[] = [];
	for (const name of PLAYERS) {
		const context = await newContext(browser, true);
		const phone = await context.newPage();
		watchConsole(phone, name);
		await phone.goto('/');
		await phone.getByTestId('code-input').fill(code.toLowerCase().replace(/(...)/, '$1 '));
		await phone.getByTestId('join-button').click();
		await phone.getByTestId('join-name').fill(name);
		await phone.getByTestId('join-submit').click();
		await expect(phone.getByTestId('player-lobby')).toBeVisible();
		await expect(host.getByTestId('lobby-players')).toContainText(name, { timeout: 2_000 });
		phones.push(phone);
	}
	await expect(host.getByTestId('lobby-players').getByTestId('player-chip')).toHaveCount(3, {
		timeout: 2_000
	});
	await host.screenshot({ path: join(SCREENSHOTS, 'host-lobby.png') });

	// --- 3. Round 1: everyone answers → reveal happens automatically -------------------------
	await host.getByTestId('start-game').click();
	await expect(host.getByTestId('host-round')).toBeVisible();
	// Kari's guess is done by hand so we can screenshot the filled-in guess screen.
	await expect(phones[0].getByTestId('guess-screen')).toBeVisible();
	const map0 = phones[0].getByTestId('guess-map');
	await expect(map0).toHaveAttribute('data-map-ready', 'true');
	await map0.click({ position: { x: 180, y: 70 } });
	await expect(map0).toHaveAttribute('data-pin-lat', /.+/);
	await phones[0].getByTestId('year-input').fill('2003');
	await phones[0].getByTestId('year-input').blur();
	const kari1: Guess = {
		lat: Number(await map0.getAttribute('data-pin-lat')),
		lng: Number(await map0.getAttribute('data-pin-lng')),
		year: 2003
	};
	await phones[0].screenshot({ path: join(SCREENSHOTS, 'phone-guess.png') });
	await phones[0].getByTestId('submit-guess').click();
	await expect(phones[0].getByTestId('guess-submitted')).toBeVisible();
	const round1: Guess[] = [
		kari1,
		await guess(phones[1], 120, 90, 2006),
		await guess(phones[2], 220, 110, 2010)
	];

	await expect(host.getByTestId('host-reveal')).toBeVisible();
	await host.waitForTimeout(800); // let the answer pin and date stamp settle for the screenshot
	await host.screenshot({ path: join(SCREENSHOTS, 'host-reveal.png') });

	const totals = new Map<string, number>(PLAYERS.map((p) => [p, 0]));
	for (const [i, phone] of phones.entries()) {
		await expect(phone.getByTestId('player-reveal')).toBeVisible();
		const score = Number(await phone.getByTestId('round-score').getAttribute('data-score'));
		expect(score).toBe(expectedScore(round1[i], 0));
		totals.set(PLAYERS[i], score);
		await expect(phone.getByTestId('total-score')).toHaveAttribute('data-total', String(score));
	}
	// The host's table agrees with every phone.
	for (const name of PLAYERS) {
		await expect(
			host.getByTestId('round-results').locator(`tr[data-player-name="${name}"]`)
		).toHaveAttribute('data-score', String(totals.get(name)));
	}

	// --- 4. Round 2 (5 s limit): Per doesn't answer and gets 0 when time runs out -----------
	await host.getByTestId('next-round').click();
	await expect(host.getByTestId('host-round')).toBeVisible();
	const [kari2, ola2] = await Promise.all([
		guess(phones[0], 150, 80, 2011),
		guess(phones[1], 200, 60, 2013)
	]);
	await expect(phones[2].getByTestId('guess-screen')).toBeVisible();
	// No "reveal now": the server's scheduled timeout must reveal the round.
	await expect(host.getByTestId('host-reveal')).toBeVisible({ timeout: 12_000 });
	await expect(phones[2].getByTestId('player-reveal')).toBeVisible();
	await expect(phones[2].getByTestId('round-score')).toHaveAttribute('data-score', '0');
	expect(Number(await phones[0].getByTestId('round-score').getAttribute('data-score'))).toBe(
		expectedScore(kari2, 1)
	);
	expect(Number(await phones[1].getByTestId('round-score').getAttribute('data-score'))).toBe(
		expectedScore(ola2, 1)
	);
	totals.set('Kari', totals.get('Kari')! + expectedScore(kari2, 1));
	totals.set('Ola', totals.get('Ola')! + expectedScore(ola2, 1));
	await expect(
		host.getByTestId('round-results').locator('tr[data-player-name="Per"]')
	).toHaveAttribute('data-score', '0');

	// --- 5. Round 3: Ola reloads mid-round and keeps name, points and submitted status ---------
	await host.getByTestId('next-round').click();
	await expect(host.getByTestId('host-round')).toBeVisible();
	const ola3 = await guess(phones[1], 160, 100, 2018);
	await phones[1].reload();
	await expect(phones[1].getByTestId('guess-submitted')).toBeVisible();
	await expect(phones[1].getByTestId('me-name')).toHaveText('Ola');
	await expect(phones[1].getByTestId('total-score')).toHaveAttribute(
		'data-total',
		String(totals.get('Ola'))
	);
	const kari3 = await guess(phones[0], 140, 90, 2019);
	const per3 = await guess(phones[2], 190, 120, 2015);
	await expect(host.getByTestId('host-reveal')).toBeVisible();
	totals.set('Kari', totals.get('Kari')! + expectedScore(kari3, 2));
	totals.set('Ola', totals.get('Ola')! + expectedScore(ola3, 2));
	totals.set('Per', totals.get('Per')! + expectedScore(per3, 2));

	// --- 6. Final results are identical on the host and every phone ---------------------------
	await host.getByTestId('next-round').click();
	await expect(host.getByTestId('host-final')).toBeVisible();
	const hostFinal = await finalStandings(host);
	expect(hostFinal).toHaveLength(3);
	for (const [name, total] of hostFinal) expect(total).toBe(totals.get(name as string));
	const sorted = [...hostFinal].sort((a, b) => (b[1] as number) - (a[1] as number));
	expect(hostFinal.map((r) => r[1])).toEqual(sorted.map((r) => r[1]));

	for (const phone of phones) {
		await expect(phone.getByTestId('player-final')).toBeVisible();
		expect(await finalStandings(phone)).toEqual(hostFinal);
	}
	await host.screenshot({ path: join(SCREENSHOTS, 'host-final.png') });
	await phones[0].screenshot({ path: join(SCREENSHOTS, 'phone-final.png') });

	expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
