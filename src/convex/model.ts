/**
 * Shared helpers for Convex functions: access checks, round transitions and
 * the read models the host and player screens subscribe to.
 */
import { ConvexError } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
	ACTIVE_WINDOW_MS,
	GUESS_GRACE_MS,
	compareStandings,
	effectiveRoundSeconds,
	normalizeCode
} from '../lib/game';
import { scoreGuess } from '../lib/scoring';

export function fail(message: string): never {
	throw new ConvexError(message);
}

export async function requireOwnedGame(
	ctx: QueryCtx,
	gameId: Id<'games'>,
	clientId: string
): Promise<Doc<'games'>> {
	const game = await ctx.db.get(gameId);
	if (!game || game.ownerClientId !== clientId) fail('Fant ikke spillet.');
	return game;
}

export async function requireHostSession(
	ctx: QueryCtx,
	sessionId: Id<'sessions'>,
	clientId: string
): Promise<Doc<'sessions'>> {
	const session = await ctx.db.get(sessionId);
	if (!session) fail('Fant ikke økten.');
	if (session.hostClientId !== clientId) fail('Bare verten kan gjøre dette.');
	return session;
}

export function listRounds(ctx: QueryCtx, gameId: Id<'games'>) {
	return ctx.db
		.query('rounds')
		.withIndex('by_game_order', (q) => q.eq('gameId', gameId))
		.collect();
}

export function listPlayers(ctx: QueryCtx, sessionId: Id<'sessions'>) {
	return ctx.db
		.query('players')
		.withIndex('by_session', (q) => q.eq('sessionId', sessionId))
		.collect();
}

export function listRoundGuesses(ctx: QueryCtx, sessionId: Id<'sessions'>, roundIndex: number) {
	return ctx.db
		.query('guesses')
		.withIndex('by_session_round', (q) => q.eq('sessionId', sessionId).eq('roundIndex', roundIndex))
		.collect();
}

/** All sessions that ever used this code, newest first. */
export function sessionsForCode(ctx: QueryCtx, rawCode: string) {
	const code = normalizeCode(rawCode);
	return ctx.db
		.query('sessions')
		.withIndex('by_code', (q) => q.eq('code', code))
		.order('desc')
		.collect();
}

export async function activeSessionsForGame(ctx: QueryCtx, game: Doc<'games'>) {
	const sessions = await ctx.db
		.query('sessions')
		.withIndex('by_host', (q) => q.eq('hostClientId', game.ownerClientId))
		.collect();
	return sessions.filter((s) => s.gameId === game._id && s.status !== 'finished');
}

export function isActive(player: Doc<'players'>, now: number) {
	return now - player.lastSeenAt <= ACTIVE_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** Opens round `index`: sets the server-side deadline and schedules the timeout reveal. */
export async function beginRound(ctx: MutationCtx, session: Doc<'sessions'>, index: number) {
	const round = await ctx.db.get(session.roundIds[index]);
	if (!round) fail('Runden finnes ikke lenger.');
	const now = Date.now();
	const seconds = effectiveRoundSeconds(session.settings, round.roundSeconds);
	const roundEndsAt = seconds > 0 ? now + seconds * 1000 : undefined;
	const scheduledRevealId =
		roundEndsAt === undefined
			? undefined
			: await ctx.scheduler.runAt(roundEndsAt + GUESS_GRACE_MS, internal.sessions.autoReveal, {
					sessionId: session._id,
					roundIndex: index
				});
	await ctx.db.patch(session._id, {
		status: 'playing',
		currentRoundIndex: index,
		roundStartedAt: now,
		roundEndsAt,
		revealedAt: undefined,
		scheduledRevealId
	});
}

/**
 * Scores the current round and moves the session to `reveal`.
 * Callers must check `status === 'playing'`; this runs inside the same
 * transaction so a double trigger can never score twice.
 */
export async function revealRound(ctx: MutationCtx, session: Doc<'sessions'>) {
	if (session.status !== 'playing') return;
	const now = Date.now();
	const index = session.currentRoundIndex;
	const round = await ctx.db.get(session.roundIds[index]);
	const guesses = await listRoundGuesses(ctx, session._id, index);
	const players = await listPlayers(ctx, session._id);

	const roundTotals = new Map<Id<'players'>, { points: number; responseMs: number }>();
	for (const guess of guesses) {
		const score = round
			? scoreGuess(
					guess,
					{ lat: round.answerLat, lng: round.answerLng, year: round.answerYear },
					session.settings.scoring
				)
			: { distanceKm: 0, yearDiff: 0, locationScore: 0, yearScore: 0, total: 0 };
		await ctx.db.patch(guess._id, {
			distanceKm: score.distanceKm,
			yearDiff: score.yearDiff,
			locationScore: score.locationScore,
			yearScore: score.yearScore
		});
		roundTotals.set(guess.playerId, { points: score.total, responseMs: guess.responseMs });
	}

	// Players who didn't answer get 0 points and the full elapsed time for tie-breaks.
	const started = session.roundStartedAt ?? now;
	const deadline = session.roundEndsAt ?? now;
	const elapsed = Math.max(0, Math.min(now, deadline) - started);
	for (const player of players) {
		const result = roundTotals.get(player._id) ?? { points: 0, responseMs: elapsed };
		await ctx.db.patch(player._id, {
			totalScore: player.totalScore + result.points,
			totalResponseMs: player.totalResponseMs + result.responseMs
		});
	}

	await cancelScheduledReveal(ctx, session);
	await ctx.db.patch(session._id, {
		status: 'reveal',
		revealedAt: now,
		scheduledRevealId: undefined
	});
}

async function cancelScheduledReveal(ctx: MutationCtx, session: Doc<'sessions'>) {
	if (!session.scheduledRevealId) return;
	const job = await ctx.db.system.get(session.scheduledRevealId);
	if (job && job.state.kind === 'pending') await ctx.scheduler.cancel(job._id);
}

/** Reveals early when every active player has answered the current round. */
export async function revealIfEveryoneAnswered(ctx: MutationCtx, session: Doc<'sessions'>) {
	if (session.status !== 'playing') return false;
	const now = Date.now();
	const players = await listPlayers(ctx, session._id);
	const active = players.filter((p) => isActive(p, now));
	if (active.length === 0) return false;
	const guesses = await listRoundGuesses(ctx, session._id, session.currentRoundIndex);
	const answered = new Set(guesses.map((g) => g.playerId));
	if (!active.every((p) => answered.has(p._id))) return false;
	await revealRound(ctx, session);
	return true;
}

export async function finishSession(ctx: MutationCtx, session: Doc<'sessions'>) {
	await cancelScheduledReveal(ctx, session);
	await ctx.db.patch(session._id, {
		status: 'finished',
		finishedAt: Date.now(),
		roundEndsAt: undefined,
		scheduledRevealId: undefined
	});
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export interface StandingEntry {
	playerId: Id<'players'>;
	name: string;
	totalScore: number;
	rank: number;
	/** Points earned in the current round (only while revealing). */
	roundScore: number | null;
	/** Rank before the current round was scored (only while revealing). */
	previousRank: number | null;
	answered: boolean;
	active: boolean;
}

export interface RoundResult {
	playerId: Id<'players'>;
	name: string;
	answered: boolean;
	lat: number | null;
	lng: number | null;
	year: number | null;
	distanceKm: number | null;
	yearDiff: number | null;
	locationScore: number;
	yearScore: number;
	total: number;
	responseMs: number | null;
}

export interface RevealedAnswer {
	year: number;
	lat: number;
	lng: number;
	label: string | null;
	caption: string | null;
}

/**
 * Session data that is safe to show to everyone. Never includes `hostClientId`
 * or answers.
 */
export function publicSession(session: Doc<'sessions'>) {
	return {
		_id: session._id,
		code: session.code,
		status: session.status,
		title: session.title,
		currentRoundIndex: session.currentRoundIndex,
		roundCount: session.roundIds.length,
		roundStartedAt: session.roundStartedAt ?? null,
		roundEndsAt: session.roundEndsAt ?? null,
		revealedAt: session.revealedAt ?? null,
		yearMin: session.settings.yearMin,
		yearMax: session.settings.yearMax,
		scoringPreset: session.settings.scoring.preset,
		hostPlays: session.settings.hostPlays
	};
}

/** Builds standings, current-round results and the answer (only once revealed). */
export async function buildSessionView(ctx: QueryCtx, session: Doc<'sessions'>, now: number) {
	const players = await listPlayers(ctx, session._id);
	const inRound = session.status === 'playing' || session.status === 'reveal';
	const revealed = session.status === 'reveal';
	const guesses = inRound
		? await listRoundGuesses(ctx, session._id, session.currentRoundIndex)
		: [];
	const guessByPlayer = new Map(guesses.map((g) => [g.playerId, g]));

	const sorted = [...players].sort(compareStandings);
	const roundScoreOf = (p: Doc<'players'>) => {
		const g = guessByPlayer.get(p._id);
		return g ? (g.locationScore ?? 0) + (g.yearScore ?? 0) : 0;
	};
	const previousRanks = new Map<Id<'players'>, number>();
	if (revealed) {
		[...players]
			.map((p) => ({ ...p, totalScore: p.totalScore - roundScoreOf(p) }))
			.sort(compareStandings)
			.forEach((p, i) => previousRanks.set(p._id, i + 1));
	}

	const standings: StandingEntry[] = sorted.map((p, i) => ({
		playerId: p._id,
		name: p.name,
		totalScore: p.totalScore,
		rank: i + 1,
		roundScore: revealed ? roundScoreOf(p) : null,
		previousRank: revealed ? (previousRanks.get(p._id) ?? null) : null,
		answered: guessByPlayer.has(p._id),
		active: now - p.lastSeenAt <= ACTIVE_WINDOW_MS
	}));

	let round: {
		index: number;
		imageUrl: string | null;
		answer: RevealedAnswer | null;
		results: RoundResult[] | null;
	} | null = null;

	if (inRound) {
		const doc = await ctx.db.get(session.roundIds[session.currentRoundIndex]);
		const results: RoundResult[] | null = revealed
			? sorted
					.map((p) => {
						const g = guessByPlayer.get(p._id);
						return {
							playerId: p._id,
							name: p.name,
							answered: !!g,
							lat: g?.lat ?? null,
							lng: g?.lng ?? null,
							year: g?.year ?? null,
							distanceKm: g?.distanceKm ?? null,
							yearDiff: g?.yearDiff ?? null,
							locationScore: g?.locationScore ?? 0,
							yearScore: g?.yearScore ?? 0,
							total: (g?.locationScore ?? 0) + (g?.yearScore ?? 0),
							responseMs: g?.responseMs ?? null
						};
					})
					.sort((a, b) => b.total - a.total)
			: null;
		round = {
			index: session.currentRoundIndex,
			imageUrl: doc ? await ctx.storage.getUrl(doc.imageId) : null,
			answer:
				revealed && doc
					? {
							year: doc.answerYear,
							lat: doc.answerLat,
							lng: doc.answerLng,
							label: doc.answerLabel ?? null,
							caption: doc.caption ?? null
						}
					: null,
			results
		};
	}

	return {
		session: publicSession(session),
		standings,
		playerCount: players.length,
		answeredCount: guesses.length,
		activeCount: standings.filter((s) => s.active).length,
		round,
		guessByPlayer
	};
}
