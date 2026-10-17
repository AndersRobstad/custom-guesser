import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { CODE_REUSE_COOLDOWN_MS, generateCode, shuffled } from '../lib/game';
import {
	beginRound,
	buildSessionView,
	fail,
	finishSession,
	listPlayers,
	listRounds,
	requireHostSession,
	requireOwnedGame,
	revealIfEveryoneAnswered,
	revealRound,
	sessionsForCode,
	touchPresence
} from './model';

const MAX_CODE_ATTEMPTS = 50;

/**
 * Starts a new session (lobby) for one of the host's games. With
 * `settings.shuffleRounds` the rounds are shuffled for this session only.
 */
export const create = mutation({
	args: { gameId: v.id('games'), clientId: v.string() },
	handler: async (ctx, { gameId, clientId }) => {
		const game = await requireOwnedGame(ctx, gameId, clientId);
		const rounds = await listRounds(ctx, game._id);
		if (rounds.length === 0) fail('Legg til minst én runde før du starter et spill.');

		const now = Date.now();
		let code: string | null = null;
		for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !code; attempt++) {
			const candidate = generateCode();
			const clash = (await sessionsForCode(ctx, candidate)).some(
				(s) => s.status !== 'finished' || now - (s.finishedAt ?? now) < CODE_REUSE_COOLDOWN_MS
			);
			if (!clash) code = candidate;
		}
		if (!code) fail('Klarte ikke å lage en ledig spillkode. Prøv igjen.');

		const sessionId = await ctx.db.insert('sessions', {
			gameId: game._id,
			hostClientId: clientId,
			code,
			status: 'lobby',
			currentRoundIndex: 0,
			createdAt: now,
			title: game.title,
			settings: game.settings,
			// The order is fixed here, server-side, so every player sees the same sequence.
			roundIds: game.settings.shuffleRounds
				? shuffled(rounds.map((r) => r._id))
				: rounds.map((r) => r._id)
		});
		await touchPresence(ctx, sessionId, clientId, 'host');
		return { sessionId, code };
	}
});

/** Public lookup used by the join screen. Case-insensitive and whitespace tolerant. */
export const lookup = query({
	args: { code: v.string() },
	handler: async (ctx, { code }) => {
		const sessions = await sessionsForCode(ctx, code);
		const session = sessions.find((s) => s.status !== 'finished') ?? sessions[0];
		if (!session) return null;
		return { code: session.code, status: session.status, title: session.title };
	}
});

/** Everything the host screen needs. Answers are only included once a round is revealed. */
export const hostState = query({
	args: { sessionId: v.string(), clientId: v.string() },
	handler: async (ctx, args) => {
		const sessionId = ctx.db.normalizeId('sessions', args.sessionId);
		if (!sessionId) return null;
		const session = await ctx.db.get(sessionId);
		if (!session || session.hostClientId !== args.clientId) return null;
		const { guessByPlayer: _, ...view } = await buildSessionView(ctx, session, Date.now(), {
			withPresence: true
		});
		const round = view.round
			? {
					...view.round,
					roundSeconds:
						session.roundEndsAt && session.roundStartedAt
							? Math.round((session.roundEndsAt - session.roundStartedAt) / 1000)
							: 0
				}
			: null;
		return {
			...view,
			round,
			gameId: session.gameId,
			isLastRound: session.currentRoundIndex >= session.roundIds.length - 1
		};
	}
});

export const start = mutation({
	args: { sessionId: v.id('sessions'), clientId: v.string() },
	handler: async (ctx, { sessionId, clientId }) => {
		const session = await requireHostSession(ctx, sessionId, clientId);
		if (session.status !== 'lobby') fail('Spillet er allerede startet.');
		if (session.roundIds.length === 0) fail('Spillet har ingen runder.');
		if ((await listPlayers(ctx, session._id)).length === 0)
			fail('Vent til minst én spiller har blitt med.');
		await beginRound(ctx, session, 0);
	}
});

/**
 * `roundIndex` (optional) is the round the host's screen is showing. If the
 * timer already revealed that round, or another tab already moved on, the call
 * is a quiet no-op instead of an error.
 */
export const revealNow = mutation({
	args: { sessionId: v.id('sessions'), clientId: v.string(), roundIndex: v.optional(v.number()) },
	handler: async (ctx, { sessionId, clientId, roundIndex }) => {
		const session = await requireHostSession(ctx, sessionId, clientId);
		const alreadyDone =
			roundIndex !== undefined &&
			(session.currentRoundIndex > roundIndex ||
				(session.currentRoundIndex === roundIndex && session.status !== 'playing'));
		if (alreadyDone) return;
		if (session.status !== 'playing') fail('Det er ingen åpen runde å avsløre.');
		await revealRound(ctx, session);
	}
});

export const next = mutation({
	args: { sessionId: v.id('sessions'), clientId: v.string(), roundIndex: v.optional(v.number()) },
	handler: async (ctx, { sessionId, clientId, roundIndex }) => {
		const session = await requireHostSession(ctx, sessionId, clientId);
		const alreadyDone =
			roundIndex !== undefined &&
			(session.currentRoundIndex > roundIndex ||
				(session.currentRoundIndex === roundIndex && session.status === 'finished'));
		if (alreadyDone) return;
		if (session.status !== 'reveal') fail('Du kan bare gå videre etter at runden er avslørt.');
		const nextIndex = session.currentRoundIndex + 1;
		if (nextIndex < session.roundIds.length) await beginRound(ctx, session, nextIndex);
		else await finishSession(ctx, session);
	}
});

/** Ends the session from any state. A running round is scored first so answers count. */
export const end = mutation({
	args: { sessionId: v.id('sessions'), clientId: v.string() },
	handler: async (ctx, { sessionId, clientId }) => {
		const session = await requireHostSession(ctx, sessionId, clientId);
		if (session.status === 'finished') return;
		if (session.status === 'playing') await revealRound(ctx, session);
		const latest = await ctx.db.get(session._id);
		if (latest) await finishSession(ctx, latest);
	}
});

/** Host presence + a chance to reveal when idle players drop out. Returns server time. */
export const hostHeartbeat = mutation({
	args: { sessionId: v.id('sessions'), clientId: v.string() },
	handler: async (ctx, { sessionId, clientId }) => {
		const session = await requireHostSession(ctx, sessionId, clientId);
		const now = await touchPresence(ctx, session._id, clientId, 'host');
		await revealIfEveryoneAnswered(ctx, session);
		return { serverNow: now };
	}
});

/** Fired by the scheduler at the round deadline. No-op if the round already moved on. */
export const autoReveal = internalMutation({
	args: { sessionId: v.id('sessions'), roundIndex: v.number() },
	handler: async (ctx, { sessionId, roundIndex }) => {
		const session = await ctx.db.get(sessionId);
		if (!session || session.status !== 'playing' || session.currentRoundIndex !== roundIndex)
			return;
		await revealRound(ctx, { ...session, scheduledRevealId: undefined });
	}
});
