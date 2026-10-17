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

/**
 * URLs for a round's media. `imageUrl` is always a still (the image itself, or
 * the poster frame for videos) so every screen can show something light;
 * `videoUrl` is only set for video rounds and is fetched on demand.
 */
export async function mediaUrls(ctx: QueryCtx, round: Doc<'rounds'>) {
	if (round.mediaType === 'video') {
		return {
			mediaType: 'video' as const,
			imageUrl: round.posterId ? await ctx.storage.getUrl(round.posterId) : null,
			videoUrl: await ctx.storage.getUrl(round.imageId)
		};
	}
	return {
		mediaType: 'image' as const,
		imageUrl: await ctx.storage.getUrl(round.imageId),
		videoUrl: null
	};
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

export function sessionsForGame(ctx: QueryCtx, gameId: Id<'games'>) {
	return ctx.db
		.query('sessions')
		.withIndex('by_game', (q) => q.eq('gameId', gameId))
		.collect();
}

export async function activeSessionsForGame(ctx: QueryCtx, game: Doc<'games'>) {
	return (await sessionsForGame(ctx, game._id)).filter((s) => s.status !== 'finished');
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

/**
 * Whether someone counts as present. During a round, everyone gets a fresh
 * window from the round start: phones that auto-locked during a long lobby or
 * reveal must not be written off the moment the next round begins.
 */
export function isActive(lastSeenAt: number | undefined, now: number, roundStartedAt?: number) {
	const since = Math.max(lastSeenAt ?? 0, roundStartedAt ?? 0);
	return now - since <= ACTIVE_WINDOW_MS;
}

export async function touchPresence(
	ctx: MutationCtx,
	sessionId: Id<'sessions'>,
	clientId: string,
	role: 'host' | 'player',
	playerId?: Id<'players'>
) {
	const now = Date.now();
	const existing = await ctx.db
		.query('presence')
		.withIndex('by_session_client', (q) => q.eq('sessionId', sessionId).eq('clientId', clientId))
		.unique();
	if (existing) await ctx.db.patch(existing._id, { lastSeenAt: now });
	else await ctx.db.insert('presence', { sessionId, clientId, role, playerId, lastSeenAt: now });
	return now;
}

/** Last heartbeat per clientId for the whole session (host view and server checks only). */
export async function presenceBySession(ctx: QueryCtx, sessionId: Id<'sessions'>) {
	const rows = await ctx.db
		.query('presence')
		.withIndex('by_session', (q) => q.eq('sessionId', sessionId))
		.collect();
	return new Map(rows.map((r) => [r.clientId, r.lastSeenAt]));
}

/** Only the host's row, so player screens aren't re-run by other players' heartbeats. */
export async function hostLastSeenAt(ctx: QueryCtx, session: Doc<'sessions'>) {
	const row = await ctx.db
		.query('presence')
		.withIndex('by_session_client', (q) =>
			q.eq('sessionId', session._id).eq('clientId', session.hostClientId)
		)
		.unique();
	return row?.lastSeenAt ?? session.createdAt;
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

/**
 * Reveals early when every active player has answered the current round.
 * Needs at least one answer, so a room of locked phones doesn't reveal an
 * empty round; if everyone who answered has since gone idle, it still reveals.
 */
export async function revealIfEveryoneAnswered(ctx: MutationCtx, session: Doc<'sessions'>) {
	if (session.status !== 'playing') return false;
	const now = Date.now();
	const guesses = await listRoundGuesses(ctx, session._id, session.currentRoundIndex);
	if (guesses.length === 0) return false;
	const answered = new Set(guesses.map((g) => g.playerId));
	const players = await listPlayers(ctx, session._id);
	const seen = await presenceBySession(ctx, session._id);
	const waitingOn = players.filter(
		(p) => !answered.has(p._id) && isActive(seen.get(p.clientId), now, session.roundStartedAt)
	);
	if (waitingOn.length > 0) return false;
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
	/** Recently seen (host view only; null in player views, which don't track presence). */
	active: boolean | null;
	joinedAt: number;
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
export function publicSession(session: Doc<'sessions'>, now: number, hostSeenAt: number) {
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
		hostPlays: session.settings.hostPlays,
		/** False when the host screen hasn't sent a heartbeat recently (the game is paused). */
		hostActive: isActive(hostSeenAt, now)
	};
}

/**
 * Builds standings, current-round results and the answer (only once revealed).
 * `withPresence` adds per-player activity (host view); player views skip it so
 * other players' heartbeats don't re-run their subscriptions.
 */
export async function buildSessionView(
	ctx: QueryCtx,
	session: Doc<'sessions'>,
	now: number,
	{ withPresence }: { withPresence: boolean }
) {
	const players = await listPlayers(ctx, session._id);
	const seen = withPresence ? await presenceBySession(ctx, session._id) : null;
	const hostSeenAt = seen?.get(session.hostClientId) ?? (await hostLastSeenAt(ctx, session));
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
	// Standings as they were before this round was scored, for the up/down arrows.
	// Mirrors `revealRound`: non-answerers were charged the elapsed time. Hidden
	// after round 1, where "before" is just join order.
	const previousRanks = new Map<Id<'players'>, number>();
	if (revealed && session.currentRoundIndex > 0) {
		const revealedAt = session.revealedAt ?? now;
		const elapsed = Math.max(
			0,
			Math.min(revealedAt, session.roundEndsAt ?? revealedAt) -
				(session.roundStartedAt ?? revealedAt)
		);
		const roundTimeOf = (p: Doc<'players'>) => {
			const g = guessByPlayer.get(p._id);
			if (g) return g.responseMs;
			return p.joinedAt <= revealedAt ? elapsed : 0;
		};
		[...players]
			.map((p) => ({
				...p,
				totalScore: p.totalScore - roundScoreOf(p),
				totalResponseMs: p.totalResponseMs - roundTimeOf(p)
			}))
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
		active: seen
			? isActive(
					seen.get(p.clientId),
					now,
					session.status === 'playing' ? session.roundStartedAt : undefined
				)
			: null,
		joinedAt: p.joinedAt
	}));

	let round: {
		index: number;
		mediaType: 'image' | 'video';
		imageUrl: string | null;
		videoUrl: string | null;
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
			...(doc ? await mediaUrls(ctx, doc) : { mediaType: 'image', imageUrl: null, videoUrl: null }),
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
		session: publicSession(session, now, hostSeenAt),
		standings,
		playerCount: players.length,
		answeredCount: guesses.length,
		activeCount: seen ? standings.filter((s) => s.active).length : null,
		round,
		guessByPlayer
	};
}
