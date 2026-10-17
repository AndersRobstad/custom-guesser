import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { modules } from './test.setup';
import {
	CODE_ALPHABET,
	CODE_LENGTH,
	CODE_REUSE_COOLDOWN_MS,
	GUESS_GRACE_MS,
	isValidCode
} from '../lib/game';
import { presetScoring, scoreGuess } from '../lib/scoring';

const HOST = 'host-client';
const STRANGER = 'stranger-client';
const T0 = new Date('2026-06-01T12:00:00Z').getTime();

/** Distinctive answers so leak tests can search for them in the serialized output. */
const ROUNDS = [
	{ answerYear: 2004, answerLat: 35.3687, answerLng: 24.4736, answerLabel: 'Rethymno, Kreta' },
	{ answerYear: 2012, answerLat: 59.9139, answerLng: 10.7522, answerLabel: 'Oslo' },
	{ answerYear: 2019, answerLat: 60.3913, answerLng: 5.3221, answerLabel: 'Bergen' }
];

function setup() {
	return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

async function storeImage(t: T) {
	return t.run((ctx) => ctx.storage.store(new Blob(['fake-image'], { type: 'image/png' })));
}

async function createGame(
	t: T,
	opts: {
		rounds?: number;
		roundSeconds?: number;
		perRound?: (number | undefined)[];
		hostPlays?: boolean;
	} = {}
) {
	const gameId = await t.mutation(api.games.create, {
		clientId: HOST,
		title: 'Hvor og når er Anders'
	});
	if (opts.roundSeconds !== undefined || opts.hostPlays !== undefined) {
		const game = await t.query(api.games.get, { gameId, clientId: HOST });
		await t.mutation(api.games.update, {
			gameId,
			clientId: HOST,
			settings: {
				...game!.game.settings,
				roundSeconds: opts.roundSeconds ?? game!.game.settings.roundSeconds,
				hostPlays: opts.hostPlays ?? false
			}
		});
	}
	const roundIds: Id<'rounds'>[] = [];
	for (let i = 0; i < (opts.rounds ?? 3); i++) {
		roundIds.push(
			await t.mutation(api.rounds.create, {
				gameId,
				clientId: HOST,
				imageId: await storeImage(t),
				...ROUNDS[i % ROUNDS.length],
				roundSeconds: opts.perRound?.[i]
			})
		);
	}
	return { gameId, roundIds };
}

async function createSession(t: T, opts: Parameters<typeof createGame>[1] = {}) {
	const game = await createGame(t, opts);
	const { sessionId, code } = await t.mutation(api.sessions.create, {
		gameId: game.gameId,
		clientId: HOST
	});
	return { ...game, sessionId, code };
}

async function join(t: T, code: string, clientId: string, name = clientId) {
	return t.mutation(api.players.join, { code, clientId, name });
}

async function guess(
	t: T,
	sessionId: Id<'sessions'>,
	clientId: string,
	roundIndex: number,
	g: { lat: number; lng: number; year: number }
) {
	return t.mutation(api.players.submitGuess, { sessionId, clientId, roundIndex, ...g });
}

async function getSession(t: T, sessionId: Id<'sessions'>) {
	return t.run((ctx) => ctx.db.get(sessionId));
}

async function getPlayers(t: T, sessionId: Id<'sessions'>) {
	return t.run((ctx) =>
		ctx.db
			.query('players')
			.withIndex('by_session', (q) => q.eq('sessionId', sessionId))
			.collect()
	);
}

/** Uniform values in [0,1) that make `generateCode` emit exactly `code`. */
function randomsFor(code: string) {
	return [...code].map((ch) => (CODE_ALPHABET.indexOf(ch) + 0.5) / CODE_ALPHABET.length);
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(T0);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('games', () => {
	it('creates games with the default settings', async () => {
		const t = setup();
		const gameId = await t.mutation(api.games.create, { clientId: HOST });
		const game = await t.query(api.games.get, { gameId, clientId: HOST });
		expect(game?.game.settings).toEqual({
			roundSeconds: 60,
			yearMin: 1999,
			yearMax: 2026,
			hostPlays: false,
			shuffleRounds: false,
			scoring: { preset: 'europe', perfectKm: 5, kKm: 500, kYear: 4 }
		});
		expect(await t.query(api.games.listMine, { clientId: HOST })).toHaveLength(1);
		expect(await t.query(api.games.listMine, { clientId: STRANGER })).toHaveLength(0);
	});

	it('hides games from other clients and ignores malformed ids', async () => {
		const t = setup();
		const { gameId } = await createGame(t, { rounds: 1 });
		expect(await t.query(api.games.get, { gameId, clientId: STRANGER })).toBeNull();
		expect(await t.query(api.games.get, { gameId: 'not-an-id', clientId: HOST })).toBeNull();
	});

	it('rejects rounds without valid year or coordinates', async () => {
		const t = setup();
		const { gameId } = await createGame(t, { rounds: 0 });
		const imageId = await storeImage(t);
		const base = { gameId, clientId: HOST, imageId, answerLat: 60, answerLng: 10 };
		await expect(t.mutation(api.rounds.create, { ...base, answerYear: 1990 })).rejects.toThrow(
			/mellom 1999 og 2026/
		);
		await expect(t.mutation(api.rounds.create, { ...base, answerYear: 2010.5 })).rejects.toThrow(
			/årstall/
		);
		await expect(
			t.mutation(api.rounds.create, { ...base, answerYear: 2010, answerLat: 95 })
		).rejects.toThrow(/plassering/);
		await expect(
			t.mutation(api.rounds.create, { ...base, answerYear: 2010, roundSeconds: 9999 })
		).rejects.toThrow(/Tidsgrensen/);
	});

	it('reorders rounds and keeps a gap-free order after deletion', async () => {
		const t = setup();
		const { gameId, roundIds } = await createGame(t, { rounds: 3 });
		await t.mutation(api.rounds.reorder, {
			gameId,
			clientId: HOST,
			roundIds: [roundIds[2], roundIds[0], roundIds[1]]
		});
		let game = await t.query(api.games.get, { gameId, clientId: HOST });
		expect(game!.rounds.map((r) => r._id)).toEqual([roundIds[2], roundIds[0], roundIds[1]]);
		await t.mutation(api.rounds.remove, { roundId: roundIds[0], clientId: HOST });
		game = await t.query(api.games.get, { gameId, clientId: HOST });
		expect(game!.rounds.map((r) => r.order)).toEqual([0, 1]);
	});

	it('refuses to start a session for a game without rounds', async () => {
		const t = setup();
		const { gameId } = await createGame(t, { rounds: 0 });
		await expect(t.mutation(api.sessions.create, { gameId, clientId: HOST })).rejects.toThrow(
			/minst én runde/
		);
	});
});

describe('join codes', () => {
	it('generates 6-character codes from the unambiguous alphabet', async () => {
		const t = setup();
		const { gameId } = await createGame(t, { rounds: 1 });
		const codes = new Set<string>();
		for (let i = 0; i < 25; i++) {
			const { code } = await t.mutation(api.sessions.create, { gameId, clientId: HOST });
			expect(code).toHaveLength(CODE_LENGTH);
			expect(isValidCode(code)).toBe(true);
			expect(code).not.toMatch(/[01OI]/);
			codes.add(code);
		}
		expect(codes.size).toBe(25);
	});

	it('regenerates on collision with a session that is not finished', async () => {
		const t = setup();
		const { gameId } = await createGame(t, { rounds: 1 });
		const sequence = [...randomsFor('ABCDEF'), ...randomsFor('ABCDEF'), ...randomsFor('XYZ234')];
		const spy = vi.spyOn(Math, 'random').mockImplementation(() => sequence.shift() ?? 0.5);
		const first = await t.mutation(api.sessions.create, { gameId, clientId: HOST });
		const second = await t.mutation(api.sessions.create, { gameId, clientId: HOST });
		spy.mockRestore();
		expect(first.code).toBe('ABCDEF');
		expect(second.code).toBe('XYZ234');
	});

	it("only reuses a finished session's code after the cooldown", async () => {
		const t = setup();
		const { gameId } = await createGame(t, { rounds: 1 });
		const sequence = [
			...randomsFor('ABCDEF'),
			...randomsFor('ABCDEF'),
			...randomsFor('XYZ234'),
			...randomsFor('ABCDEF')
		];
		vi.spyOn(Math, 'random').mockImplementation(() => sequence.shift() ?? 0.5);
		const first = await t.mutation(api.sessions.create, { gameId, clientId: HOST });
		await t.mutation(api.sessions.end, { sessionId: first.sessionId, clientId: HOST });
		// Just finished: ABCDEF is still taken, so a new code is drawn.
		const second = await t.mutation(api.sessions.create, { gameId, clientId: HOST });
		expect(second.code).toBe('XYZ234');
		vi.setSystemTime(T0 + CODE_REUSE_COOLDOWN_MS + 1);
		const third = await t.mutation(api.sessions.create, { gameId, clientId: HOST });
		expect(third.code).toBe('ABCDEF');
		expect(third.sessionId).not.toBe(first.sessionId);
	});

	it('looks up codes case-insensitively and ignores whitespace', async () => {
		const t = setup();
		const { code } = await createSession(t, { rounds: 1 });
		const messy = ` ${code.slice(0, 3).toLowerCase()} ${code.slice(3)} `;
		expect(await t.query(api.sessions.lookup, { code: messy })).toMatchObject({
			code,
			status: 'lobby'
		});
		expect(await t.query(api.sessions.lookup, { code: 'ZZZZZZ' })).toBeNull();
		const joined = await join(t, messy, 'p1', 'Kari');
		expect(joined.code).toBe(code);
	});
});

describe('joining', () => {
	it('validates names: empty, too long and duplicates (case-insensitive)', async () => {
		const t = setup();
		const { code } = await createSession(t, { rounds: 1 });
		await expect(join(t, code, 'p1', '   ')).rejects.toThrow(/navn/i);
		await expect(join(t, code, 'p1', 'x'.repeat(21))).rejects.toThrow(/maks 20/);
		await join(t, code, 'p1', '  Kari  Nordmann ');
		await expect(join(t, code, 'p2', 'kari nordmann')).rejects.toThrow(/allerede tatt/);
		await join(t, code, 'p3', 'x'.repeat(20));
	});

	it('gives the same clientId its existing player back', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 1 });
		const first = await join(t, code, 'p1', 'Kari');
		const again = await join(t, code, 'p1', 'Kari');
		const renamed = await join(t, code, 'p1', 'Noe annet');
		expect(again.playerId).toBe(first.playerId);
		expect(renamed.playerId).toBe(first.playerId);
		expect(await getPlayers(t, sessionId)).toHaveLength(1);
	});

	it('rejects joins after the session is finished, unknown codes and the host', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 1 });
		await expect(join(t, code, HOST, 'Verten')).rejects.toThrow(/vert/);
		await join(t, code, 'p1', 'Kari');
		await t.mutation(api.sessions.end, { sessionId, clientId: HOST });
		await expect(join(t, code, 'p2', 'Ola')).rejects.toThrow(/allerede ferdig/);
		await expect(join(t, 'QQQQQQ', 'p2', 'Ola')).rejects.toThrow(/Fant ingen spill/);
		// Existing players can still get back in to see the results.
		const back = await join(t, code, 'p1', 'Kari');
		expect(back.sessionId).toBe(sessionId);
	});

	it('lets the host join as a player when hostPlays is on', async () => {
		const t = setup();
		const { code } = await createSession(t, { rounds: 1, hostPlays: true });
		await expect(join(t, code, HOST, 'Verten')).resolves.toMatchObject({ code });
	});

	it('allows late joins during play and reveal, starting from 0 points', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 2 });
		await join(t, code, 'p1', 'Kari');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		await join(t, code, 'late1', 'Sen1');
		await guess(t, sessionId, 'late1', 0, { lat: 35, lng: 24, year: 2004 });
		await t.mutation(api.sessions.revealNow, { sessionId, clientId: HOST });
		await join(t, code, 'late2', 'Sen2');
		const players = await getPlayers(t, sessionId);
		const late2 = players.find((p) => p.clientId === 'late2')!;
		expect(late2.totalScore).toBe(0);
		await t.mutation(api.sessions.next, { sessionId, clientId: HOST });
		await expect(
			guess(t, sessionId, 'late2', 1, { lat: 59.9, lng: 10.7, year: 2012 })
		).resolves.toBeNull();
	});
});

describe('host access control', () => {
	it('rejects every host action from a non-host client', async () => {
		const t = setup();
		const { code, sessionId, gameId, roundIds } = await createSession(t, { rounds: 2 });
		await join(t, code, 'p1', 'Kari');
		const args = { sessionId, clientId: STRANGER };
		for (const fn of [
			api.sessions.start,
			api.sessions.revealNow,
			api.sessions.next,
			api.sessions.end,
			api.sessions.hostHeartbeat
		]) {
			await expect(t.mutation(fn, args)).rejects.toThrow(/Bare verten/);
		}
		expect(await t.query(api.sessions.hostState, args)).toBeNull();
		await expect(t.mutation(api.sessions.create, { gameId, clientId: STRANGER })).rejects.toThrow(
			/Fant ikke spillet/
		);
		await expect(
			t.mutation(api.games.update, { gameId, clientId: STRANGER, title: 'Hacket' })
		).rejects.toThrow(/Fant ikke spillet/);
		await expect(t.mutation(api.games.remove, { gameId, clientId: STRANGER })).rejects.toThrow(
			/Fant ikke spillet/
		);
		await expect(
			t.mutation(api.rounds.remove, { roundId: roundIds[0], clientId: STRANGER })
		).rejects.toThrow(/Fant ikke spillet/);
		await expect(
			t.mutation(api.rounds.reorder, { gameId, clientId: STRANGER, roundIds })
		).rejects.toThrow(/Fant ikke spillet/);
		// Nothing changed.
		expect((await getSession(t, sessionId))?.status).toBe('lobby');
	});
});

describe('host presence', () => {
	it('tells players when the host screen has gone quiet, and recovers on heartbeat', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 1 });
		await join(t, code, 'p1', 'Kari');
		let state = await t.query(api.players.state, { code, clientId: 'p1' });
		expect(state?.session.hostActive).toBe(true);
		vi.setSystemTime(T0 + 46_000);
		state = await t.query(api.players.state, { code, clientId: 'p1' });
		expect(state?.session.hostActive).toBe(false);
		await t.mutation(api.sessions.hostHeartbeat, { sessionId, clientId: HOST });
		state = await t.query(api.players.state, { code, clientId: 'p1' });
		expect(state?.session.hostActive).toBe(true);
	});
});

describe('state transitions', () => {
	it('rejects illegal transitions', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 1 });
		const host = { sessionId, clientId: HOST };
		await expect(t.mutation(api.sessions.start, host)).rejects.toThrow(/minst én spiller/);
		await expect(t.mutation(api.sessions.next, host)).rejects.toThrow(/etter at runden er avslørt/);
		await expect(t.mutation(api.sessions.revealNow, host)).rejects.toThrow(/ingen åpen runde/);
		await join(t, code, 'p1', 'Kari');
		await t.mutation(api.sessions.start, host);
		await expect(t.mutation(api.sessions.start, host)).rejects.toThrow(/allerede startet/);
		await expect(t.mutation(api.sessions.next, host)).rejects.toThrow(/etter at runden er avslørt/);
		await t.mutation(api.sessions.revealNow, host);
		await expect(t.mutation(api.sessions.revealNow, host)).rejects.toThrow(/ingen åpen runde/);
		await t.mutation(api.sessions.next, host);
		expect((await getSession(t, sessionId))?.status).toBe('finished');
		await expect(t.mutation(api.sessions.next, host)).rejects.toThrow();
	});

	it('walks lobby → playing → reveal → playing → … → finished', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 2 });
		const host = { sessionId, clientId: HOST };
		await join(t, code, 'p1', 'Kari');
		await t.mutation(api.sessions.start, host);
		let s = await getSession(t, sessionId);
		expect(s).toMatchObject({ status: 'playing', currentRoundIndex: 0, roundStartedAt: T0 });
		expect(s?.roundEndsAt).toBe(T0 + 60_000);
		await t.mutation(api.sessions.revealNow, host);
		expect((await getSession(t, sessionId))?.status).toBe('reveal');
		await t.mutation(api.sessions.next, host);
		s = await getSession(t, sessionId);
		expect(s).toMatchObject({ status: 'playing', currentRoundIndex: 1 });
		await t.mutation(api.sessions.revealNow, host);
		await t.mutation(api.sessions.next, host);
		expect((await getSession(t, sessionId))?.status).toBe('finished');
	});

	it('uses the per-image time limit when set (0 = no timer)', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 3, perRound: [5, 0, undefined] });
		const host = { sessionId, clientId: HOST };
		await join(t, code, 'p1', 'Kari');
		await t.mutation(api.sessions.start, host);
		expect((await getSession(t, sessionId))?.roundEndsAt).toBe(T0 + 5_000);
		await t.mutation(api.sessions.revealNow, host);
		await t.mutation(api.sessions.next, host);
		expect((await getSession(t, sessionId))?.roundEndsAt).toBeUndefined();
		await t.mutation(api.sessions.revealNow, host);
		await t.mutation(api.sessions.next, host);
		expect((await getSession(t, sessionId))?.roundEndsAt).toBe(T0 + 60_000);
	});

	it('ending mid-round scores the answers that were already sent', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 2 });
		await join(t, code, 'p1', 'Kari');
		await join(t, code, 'p2', 'Ola');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		await guess(t, sessionId, 'p1', 0, { lat: 35.3687, lng: 24.4736, year: 2004 });
		await t.mutation(api.sessions.end, { sessionId, clientId: HOST });
		const players = await getPlayers(t, sessionId);
		expect(players.find((p) => p.clientId === 'p1')?.totalScore).toBe(10_000);
		expect((await getSession(t, sessionId))?.status).toBe('finished');
	});
});

describe('guesses', () => {
	async function playingSession(t: T, opts: Parameters<typeof createGame>[1] = {}) {
		const s = await createSession(t, { rounds: 2, ...opts });
		await join(t, s.code, 'p1', 'Kari');
		await join(t, s.code, 'p2', 'Ola');
		return s;
	}

	it('rejects guesses outside the playing state', async () => {
		const t = setup();
		const { sessionId } = await playingSession(t);
		const g = { lat: 60, lng: 10, year: 2010 };
		await expect(guess(t, sessionId, 'p1', 0, g)).rejects.toThrow(/ikke åpen/);
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		await t.mutation(api.sessions.revealNow, { sessionId, clientId: HOST });
		await expect(guess(t, sessionId, 'p1', 0, g)).rejects.toThrow(/ikke åpen/);
		await t.mutation(api.sessions.next, { sessionId, clientId: HOST });
		// Stale round index from an old screen.
		await expect(guess(t, sessionId, 'p1', 0, g)).rejects.toThrow(/ikke åpen/);
	});

	it('accepts one guess per player per round', async () => {
		const t = setup();
		const { sessionId } = await playingSession(t);
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		const g = { lat: 60, lng: 10, year: 2010 };
		await guess(t, sessionId, 'p1', 0, g);
		await expect(guess(t, sessionId, 'p1', 0, { ...g, year: 2011 })).rejects.toThrow(
			/allerede svart/
		);
		await expect(guess(t, sessionId, STRANGER, 0, g)).rejects.toThrow(/ikke med/);
	});

	it('rejects years outside yearMin–yearMax and invalid coordinates', async () => {
		const t = setup();
		const { sessionId } = await playingSession(t);
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		await expect(guess(t, sessionId, 'p1', 0, { lat: 60, lng: 10, year: 1998 })).rejects.toThrow(
			/mellom 1999 og 2026/
		);
		await expect(guess(t, sessionId, 'p1', 0, { lat: 60, lng: 10, year: 2027 })).rejects.toThrow(
			/mellom/
		);
		await expect(guess(t, sessionId, 'p1', 0, { lat: 60, lng: 10, year: 2010.5 })).rejects.toThrow(
			/mellom/
		);
		await expect(guess(t, sessionId, 'p1', 0, { lat: 91, lng: 10, year: 2010 })).rejects.toThrow(
			/Ugyldig plassering/
		);
		await expect(guess(t, sessionId, 'p1', 0, { lat: 60, lng: -181, year: 2010 })).rejects.toThrow(
			/Ugyldig plassering/
		);
		await expect(
			guess(t, sessionId, 'p1', 0, { lat: Number.NaN, lng: 10, year: 2010 })
		).rejects.toThrow(/Ugyldig plassering/);
	});

	it('accepts guesses within the 1 s grace period and rejects them after', async () => {
		const t = setup();
		const { sessionId } = await playingSession(t);
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		vi.setSystemTime(T0 + 60_000 + GUESS_GRACE_MS - 100);
		// Keep p2 active so p1's answer doesn't trigger the "everyone answered" reveal.
		await t.mutation(api.players.heartbeat, { sessionId, clientId: 'p2' });
		await guess(t, sessionId, 'p1', 0, { lat: 60, lng: 10, year: 2010 });
		vi.setSystemTime(T0 + 60_000 + GUESS_GRACE_MS + 1);
		await expect(guess(t, sessionId, 'p2', 0, { lat: 60, lng: 10, year: 2010 })).rejects.toThrow(
			/Tiden er ute/
		);
	});
});

describe('reveal and scoring', () => {
	const params = presetScoring('europe');

	it('reveals automatically when every active player has answered, with correct scores', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 2 });
		await join(t, code, 'p1', 'Kari');
		await join(t, code, 'p2', 'Ola');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });

		const g1 = { lat: 35.3, lng: 24.5, year: 2005 };
		const g2 = { lat: 59.9, lng: 10.7, year: 2000 };
		vi.setSystemTime(T0 + 4_000);
		await guess(t, sessionId, 'p1', 0, g1);
		expect((await getSession(t, sessionId))?.status).toBe('playing');
		vi.setSystemTime(T0 + 9_000);
		await guess(t, sessionId, 'p2', 0, g2);
		expect((await getSession(t, sessionId))?.status).toBe('reveal');

		const answer = {
			lat: ROUNDS[0].answerLat,
			lng: ROUNDS[0].answerLng,
			year: ROUNDS[0].answerYear
		};
		const players = await getPlayers(t, sessionId);
		const kari = players.find((p) => p.clientId === 'p1')!;
		const ola = players.find((p) => p.clientId === 'p2')!;
		expect(kari.totalScore).toBe(scoreGuess(g1, answer, params).total);
		expect(ola.totalScore).toBe(scoreGuess(g2, answer, params).total);
		expect(kari.totalResponseMs).toBe(4_000);
		expect(ola.totalResponseMs).toBe(9_000);

		const guesses = await t.run((ctx) => ctx.db.query('guesses').collect());
		const kariGuess = guesses.find((g) => g.playerId === kari._id)!;
		const expected = scoreGuess(g1, answer, params);
		expect(kariGuess).toMatchObject({
			yearDiff: 1,
			locationScore: expected.locationScore,
			yearScore: 3894
		});
		expect(kariGuess.distanceKm).toBeCloseTo(expected.distanceKm, 9);

		// The scheduled timeout for this round was cancelled.
		const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
		expect(jobs.every((j) => j.state.kind !== 'pending')).toBe(true);
	});

	it('ignores players without a heartbeat in the last 45 s', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 1, roundSeconds: 300 });
		await join(t, code, 'p1', 'Kari');
		await join(t, code, 'idle', 'Borte');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		vi.setSystemTime(T0 + 46_000);
		await t.mutation(api.players.heartbeat, { sessionId, clientId: 'p1' });
		await guess(t, sessionId, 'p1', 0, { lat: 60, lng: 10, year: 2010 });
		expect((await getSession(t, sessionId))?.status).toBe('reveal');
	});

	it('host heartbeat reveals once the only missing player has gone idle', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 1, roundSeconds: 300 });
		await join(t, code, 'p1', 'Kari');
		await join(t, code, 'idle', 'Borte');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		await guess(t, sessionId, 'p1', 0, { lat: 60, lng: 10, year: 2010 });
		expect((await getSession(t, sessionId))?.status).toBe('playing');
		vi.setSystemTime(T0 + 40_000);
		await t.mutation(api.players.heartbeat, { sessionId, clientId: 'p1' });
		vi.setSystemTime(T0 + 50_000);
		await t.mutation(api.sessions.hostHeartbeat, { sessionId, clientId: HOST });
		expect((await getSession(t, sessionId))?.status).toBe('reveal');
	});

	it('reveals via the scheduler when time runs out; non-answers score 0', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 2, roundSeconds: 5 });
		await join(t, code, 'p1', 'Kari');
		await join(t, code, 'p2', 'Ola');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		await guess(t, sessionId, 'p1', 0, { lat: 35.3687, lng: 24.4736, year: 2004 });
		expect((await getSession(t, sessionId))?.status).toBe('playing');

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const session = await getSession(t, sessionId);
		expect(session?.status).toBe('reveal');
		expect(session?.revealedAt).toBe(T0 + 5_000 + GUESS_GRACE_MS);
		const players = await getPlayers(t, sessionId);
		expect(players.find((p) => p.clientId === 'p1')?.totalScore).toBe(10_000);
		expect(players.find((p) => p.clientId === 'p2')?.totalScore).toBe(0);
	});

	it('is idempotent when the reveal is triggered twice', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 2, roundSeconds: 5 });
		await join(t, code, 'p1', 'Kari');
		await join(t, code, 'p2', 'Ola');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		await guess(t, sessionId, 'p1', 0, { lat: 35, lng: 24, year: 2003 });
		await t.mutation(api.sessions.revealNow, { sessionId, clientId: HOST });
		const before = await getPlayers(t, sessionId);

		// A late timer firing, or a direct double call, must not score again.
		await t.mutation(internal.sessions.autoReveal, { sessionId, roundIndex: 0 });
		await t.mutation(internal.sessions.autoReveal, { sessionId, roundIndex: 0 });
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(await getPlayers(t, sessionId)).toEqual(before);
		expect((await getSession(t, sessionId))?.status).toBe('reveal');

		// A stale timer from round 0 must not touch round 1.
		await t.mutation(api.sessions.next, { sessionId, clientId: HOST });
		await t.mutation(internal.sessions.autoReveal, { sessionId, roundIndex: 0 });
		expect((await getSession(t, sessionId))?.status).toBe('playing');
	});

	it('breaks ties on total response time', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 1 });
		await join(t, code, 'slow', 'Treg');
		await join(t, code, 'fast', 'Rask');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		const g = { lat: 35.3687, lng: 24.4736, year: 2004 };
		vi.setSystemTime(T0 + 2_000);
		await guess(t, sessionId, 'fast', 0, g);
		vi.setSystemTime(T0 + 8_000);
		await guess(t, sessionId, 'slow', 0, g);
		const state = await t.query(api.sessions.hostState, { sessionId, clientId: HOST });
		expect(state?.standings.map((s) => [s.name, s.totalScore, s.rank])).toEqual([
			['Rask', 10_000, 1],
			['Treg', 10_000, 2]
		]);
	});
});

describe('answer leakage', () => {
	const answerKeys = /answerYear|answerLat|answerLng|answerLabel/;

	function containsAnswer(value: unknown, round = ROUNDS[0]) {
		const json = JSON.stringify(value);
		return (
			answerKeys.test(json) ||
			json.includes(String(round.answerLat)) ||
			json.includes(String(round.answerLng)) ||
			json.includes(round.answerLabel)
		);
	}

	it('player state never contains answers before the round is revealed', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 2 });
		await join(t, code, 'p1', 'Kari');
		await join(t, code, 'p2', 'Ola');

		const lobby = await t.query(api.players.state, { code, clientId: 'p1' });
		expect(lobby?.round).toBeNull();
		expect(containsAnswer(lobby)).toBe(false);

		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		await guess(t, sessionId, 'p1', 0, { lat: 50, lng: 10, year: 2010 });
		const playing = await t.query(api.players.state, { code, clientId: 'p1' });
		expect(playing?.round).not.toBeNull();
		expect(playing?.round?.answer).toBeNull();
		expect(playing?.round?.results).toBeNull();
		expect(playing?.round?.myGuess).toMatchObject({ lat: 50, lng: 10, year: 2010 });
		expect(playing?.round).not.toHaveProperty('answerYear');
		expect(playing?.round).not.toHaveProperty('answerLat');
		expect(playing?.round).not.toHaveProperty('answerLng');
		expect(containsAnswer(playing)).toBe(false);
		// Other players' guesses are not visible either.
		const other = await t.query(api.players.state, { code, clientId: 'p2' });
		expect(JSON.stringify(other)).not.toContain('"lat":50');
		expect(JSON.stringify(other)).not.toContain('hostClientId');
		expect(JSON.stringify(other)).not.toContain(HOST);

		const host = await t.query(api.sessions.hostState, { sessionId, clientId: HOST });
		expect(host?.round?.answer).toBeNull();
		expect(containsAnswer(host)).toBe(false);
		expect(containsAnswer(await t.query(api.sessions.lookup, { code }))).toBe(false);

		await t.mutation(api.sessions.revealNow, { sessionId, clientId: HOST });
		const revealed = await t.query(api.players.state, { code, clientId: 'p2' });
		expect(revealed?.round?.answer).toEqual({
			year: ROUNDS[0].answerYear,
			lat: ROUNDS[0].answerLat,
			lng: ROUNDS[0].answerLng,
			label: ROUNDS[0].answerLabel,
			caption: null
		});
		expect(revealed?.round?.results?.map((r) => r.name).sort()).toEqual(['Kari', 'Ola']);

		// The next round's answer stays hidden again.
		await t.mutation(api.sessions.next, { sessionId, clientId: HOST });
		const nextRound = await t.query(api.players.state, { code, clientId: 'p1' });
		expect(nextRound?.round?.answer).toBeNull();
		expect(containsAnswer(nextRound, ROUNDS[1])).toBe(false);
	});

	it('restores a player after refresh with their submitted guess', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 2 });
		const { playerId } = await join(t, code, 'p1', 'Kari');
		await join(t, code, 'p2', 'Ola');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		await guess(t, sessionId, 'p1', 0, { lat: 50, lng: 10, year: 2010 });
		const lower = await t.query(api.players.state, { code: code.toLowerCase(), clientId: 'p1' });
		expect(lower?.me).toMatchObject({ _id: playerId, name: 'Kari' });
		expect(lower?.round?.myGuess?.year).toBe(2010);
		expect(await t.query(api.players.state, { code, clientId: 'nobody' })).toMatchObject({
			me: null
		});
	});
});

describe('video rounds', () => {
	async function storeVideo(t: T) {
		return t.run((ctx) => ctx.storage.store(new Blob(['fake-video'], { type: 'video/mp4' })));
	}

	async function videoGame(t: T) {
		const { gameId } = await createGame(t, { rounds: 0 });
		const imageId = await storeVideo(t);
		const posterId = await storeImage(t);
		const roundId = await t.mutation(api.rounds.create, {
			gameId,
			clientId: HOST,
			imageId,
			mediaType: 'video',
			posterId,
			...ROUNDS[0]
		});
		return { gameId, roundId, imageId, posterId };
	}

	it('stores a video with its poster frame and exposes both URLs', async () => {
		const t = setup();
		const { gameId } = await videoGame(t);
		const game = await t.query(api.games.get, { gameId, clientId: HOST });
		const round = game!.rounds[0];
		expect(round.mediaType).toBe('video');
		expect(round.videoUrl).toBeTruthy();
		expect(round.imageUrl).toBeTruthy();
		expect(round.imageUrl).not.toBe(round.videoUrl);
	});

	it('rejects videos without a poster frame', async () => {
		// convex-test doesn't record upload content types, so the image/video type
		// checks in `validateMedia` are only exercised against a real backend (E2E).
		const t = setup();
		const { gameId } = await createGame(t, { rounds: 0 });
		const base = { gameId, clientId: HOST, ...ROUNDS[0] };
		await expect(
			t.mutation(api.rounds.create, { ...base, imageId: await storeVideo(t), mediaType: 'video' })
		).rejects.toThrow(/stillbilde/);
	});

	it('gives players the poster and an on-demand video URL during play', async () => {
		const t = setup();
		const { gameId } = await videoGame(t);
		const { sessionId, code } = await t.mutation(api.sessions.create, { gameId, clientId: HOST });
		await join(t, code, 'p1', 'Kari');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		const state = await t.query(api.players.state, { code, clientId: 'p1' });
		expect(state?.round).toMatchObject({ mediaType: 'video', answer: null });
		expect(state?.round?.videoUrl).toBeTruthy();
		expect(state?.round?.imageUrl).toBeTruthy();
	});

	it('deletes the video and poster files with the round', async () => {
		const t = setup();
		const { roundId, imageId, posterId } = await videoGame(t);
		await t.mutation(api.rounds.remove, { roundId, clientId: HOST });
		const files = await t.run(async (ctx) => [
			await ctx.db.system.get(imageId),
			await ctx.db.system.get(posterId)
		]);
		expect(files).toEqual([null, null]);
	});
});

describe('review regressions', () => {
	it('gives everyone a fresh activity window when a round starts', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 1, roundSeconds: 300 });
		await join(t, code, 'p1', 'Kari');
		await join(t, code, 'sleepy', 'Låst mobil');
		// A long lobby: the sleepy phone locked and stopped sending heartbeats.
		vi.setSystemTime(T0 + 120_000);
		await t.mutation(api.players.heartbeat, { sessionId, clientId: 'p1' });
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		vi.setSystemTime(T0 + 125_000);
		await guess(t, sessionId, 'p1', 0, { lat: 60, lng: 10, year: 2010 });
		expect((await getSession(t, sessionId))?.status).toBe('playing');
		// After 45 s of round time without a sign of life, it no longer holds the round up.
		vi.setSystemTime(T0 + 120_000 + 46_000);
		await t.mutation(api.sessions.hostHeartbeat, { sessionId, clientId: HOST });
		expect((await getSession(t, sessionId))?.status).toBe('reveal');
	});

	it('does not reveal an empty round just because everyone is idle', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 1, roundSeconds: 0 });
		await join(t, code, 'p1', 'Kari');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		vi.setSystemTime(T0 + 100_000);
		await t.mutation(api.sessions.hostHeartbeat, { sessionId, clientId: HOST });
		expect((await getSession(t, sessionId))?.status).toBe('playing');
	});

	it('treats a late "reveal now" / double "next" for an old round as a no-op', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 3, roundSeconds: 5 });
		await join(t, code, 'p1', 'Kari');
		await join(t, code, 'p2', 'Ola');
		const host = { sessionId, clientId: HOST };
		await t.mutation(api.sessions.start, host);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect((await getSession(t, sessionId))?.status).toBe('reveal');
		await expect(
			t.mutation(api.sessions.revealNow, { ...host, roundIndex: 0 })
		).resolves.toBeNull();
		await t.mutation(api.sessions.next, { ...host, roundIndex: 0 });
		await t.mutation(api.sessions.next, { ...host, roundIndex: 0 });
		expect(await getSession(t, sessionId)).toMatchObject({
			status: 'playing',
			currentRoundIndex: 1
		});
		// Without the round index the old strict behaviour stays.
		await expect(t.mutation(api.sessions.next, host)).rejects.toThrow(/etter at runden er avslørt/);
	});

	it('shows rank movement from round 2, accounting for response-time tie-breaks', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 2 });
		await join(t, code, 'a', 'A');
		await join(t, code, 'b', 'B');
		const host = { sessionId, clientId: HOST };
		await t.mutation(api.sessions.start, host);
		vi.setSystemTime(T0 + 5_000);
		await guess(t, sessionId, 'b', 0, { lat: 35.3687, lng: 24.4736, year: 2000 }); // 5000 + 1839
		vi.setSystemTime(T0 + 20_000);
		await guess(t, sessionId, 'a', 0, { lat: 35.3687, lng: 24.4736, year: 2004 }); // 10000
		let state = await t.query(api.sessions.hostState, host);
		expect(state?.standings.map((s) => s.previousRank)).toEqual([null, null]);

		await t.mutation(api.sessions.next, host);
		vi.setSystemTime(T0 + 30_000);
		await guess(t, sessionId, 'a', 1, { lat: 0, lng: -170, year: 1999 });
		await guess(t, sessionId, 'b', 1, { lat: 59.9139, lng: 10.7522, year: 2012 });
		state = await t.query(api.sessions.hostState, host);
		const byName = Object.fromEntries(state!.standings.map((s) => [s.name, s]));
		expect(byName.B).toMatchObject({ rank: 1, previousRank: 2 });
		expect(byName.A).toMatchObject({ rank: 2, previousRank: 1 });
	});

	it('only tracks presence in the host view and keeps player views presence-free', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 1 });
		await join(t, code, 'p1', 'Kari');
		const hostView = await t.query(api.sessions.hostState, { sessionId, clientId: HOST });
		expect(hostView?.standings[0].active).toBe(true);
		const playerView = await t.query(api.players.state, { code, clientId: 'p1' });
		expect(playerView?.standings[0].active).toBeNull();
		const rows = await t.run((ctx) => ctx.db.query('presence').collect());
		expect(rows.map((r) => r.role).sort()).toEqual(['host', 'player']);
	});

	it('shows a finished game to non-players instead of "not found"', async () => {
		const t = setup();
		const { code, sessionId } = await createSession(t, { rounds: 1 });
		await join(t, code, 'p1', 'Kari');
		await t.mutation(api.sessions.end, { sessionId, clientId: HOST });
		const view = await t.query(api.players.state, { code, clientId: 'stranger' });
		expect(view).toMatchObject({ me: null, session: { status: 'finished' } });
	});
});

describe('round order', () => {
	async function setShuffle(t: T, gameId: Id<'games'>, shuffleRounds: boolean) {
		const game = await t.query(api.games.get, { gameId, clientId: HOST });
		await t.mutation(api.games.update, {
			gameId,
			clientId: HOST,
			settings: { ...game!.game.settings, shuffleRounds }
		});
	}

	it('keeps the saved order when shuffling is off', async () => {
		const t = setup();
		const { gameId, roundIds } = await createGame(t, { rounds: 3 });
		const { sessionId } = await t.mutation(api.sessions.create, { gameId, clientId: HOST });
		expect((await getSession(t, sessionId))?.roundIds).toEqual(roundIds);
	});

	it('shuffles per session on the server, so every player gets the same order', async () => {
		const t = setup();
		const { gameId, roundIds } = await createGame(t, { rounds: 3 });
		await setShuffle(t, gameId, true);
		// 6 randoms for the join code, then Fisher–Yates picks j=0 (i=2) and j=1 (i=1) → reversed.
		const sequence = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.1, 0.9];
		vi.spyOn(Math, 'random').mockImplementation(() => sequence.shift() ?? 0.5);
		const { sessionId, code } = await t.mutation(api.sessions.create, { gameId, clientId: HOST });
		vi.restoreAllMocks();
		expect((await getSession(t, sessionId))?.roundIds).toEqual([...roundIds].reverse());

		// The saved game order is untouched.
		const game = await t.query(api.games.get, { gameId, clientId: HOST });
		expect(game!.rounds.map((r) => r._id)).toEqual(roundIds);

		// Round 1 of this session is the game's last round, for everyone.
		await join(t, code, 'p1', 'Kari');
		await join(t, code, 'p2', 'Ola');
		await t.mutation(api.sessions.start, { sessionId, clientId: HOST });
		await t.mutation(api.sessions.revealNow, { sessionId, clientId: HOST });
		for (const clientId of ['p1', 'p2']) {
			const view = await t.query(api.players.state, { code, clientId });
			expect(view?.round?.answer?.year).toBe(ROUNDS[2].answerYear);
		}
	});

	it('lets the host reorder the saved rounds (e.g. after shuffling in the builder)', async () => {
		const t = setup();
		const { gameId, roundIds } = await createGame(t, { rounds: 3 });
		const order = [roundIds[1], roundIds[2], roundIds[0]];
		await t.mutation(api.rounds.reorder, { gameId, clientId: HOST, roundIds: order });
		const { sessionId } = await t.mutation(api.sessions.create, { gameId, clientId: HOST });
		expect((await getSession(t, sessionId))?.roundIds).toEqual(order);
	});
});
