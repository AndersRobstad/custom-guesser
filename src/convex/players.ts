import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query, type QueryCtx } from './_generated/server';
import { GUESS_GRACE_MS, isValidLatLng, nameKey, normalizeName, validateName } from '../lib/game';
import {
	buildSessionView,
	fail,
	listPlayers,
	revealIfEveryoneAnswered,
	sessionsForCode
} from './model';

async function findPlayer(ctx: QueryCtx, sessionId: Doc<'sessions'>['_id'], clientId: string) {
	return ctx.db
		.query('players')
		.withIndex('by_session_client', (q) => q.eq('sessionId', sessionId).eq('clientId', clientId))
		.unique();
}

/**
 * Join a session by code. The same clientId always gets its existing player back
 * (reconnect), so refreshing never creates duplicates.
 */
export const join = mutation({
	args: { code: v.string(), clientId: v.string(), name: v.string() },
	handler: async (ctx, { code, clientId, name }) => {
		if (!clientId) fail('Mangler klient-id.');
		const sessions = await sessionsForCode(ctx, code);
		const open = sessions.find((s) => s.status !== 'finished');

		if (!open) {
			// A finished session still lets its own players back in to see the results.
			for (const s of sessions) {
				const existing = await findPlayer(ctx, s._id, clientId);
				if (existing) return { sessionId: s._id, playerId: existing._id, code: s.code };
			}
			fail(
				sessions.length > 0
					? 'Dette spillet er allerede ferdig.'
					: 'Fant ingen spill med den koden.'
			);
		}

		const existing = await findPlayer(ctx, open._id, clientId);
		if (existing) return { sessionId: open._id, playerId: existing._id, code: open.code };

		if (clientId === open.hostClientId && !open.settings.hostPlays)
			fail('Du er vert for dette spillet og kan ikke spille med selv.');

		const nameError = validateName(name);
		if (nameError) fail(nameError);
		const clean = normalizeName(name);
		const key = nameKey(clean);
		const players = await listPlayers(ctx, open._id);
		if (players.some((p) => p.nameKey === key)) fail('Navnet er allerede tatt. Velg et annet.');

		const now = Date.now();
		const playerId = await ctx.db.insert('players', {
			sessionId: open._id,
			clientId,
			name: clean,
			nameKey: key,
			totalScore: 0,
			totalResponseMs: 0,
			joinedAt: now,
			lastSeenAt: now
		});
		return { sessionId: open._id, playerId, code: open.code };
	}
});

/** Keeps the player counted as active. Returns server time so clients can correct clock skew. */
export const heartbeat = mutation({
	args: { sessionId: v.id('sessions'), clientId: v.string() },
	handler: async (ctx, { sessionId, clientId }) => {
		const now = Date.now();
		const player = await findPlayer(ctx, sessionId, clientId);
		if (player) await ctx.db.patch(player._id, { lastSeenAt: now });
		return { serverNow: now, known: !!player };
	}
});

export const submitGuess = mutation({
	args: {
		sessionId: v.id('sessions'),
		clientId: v.string(),
		roundIndex: v.number(),
		lat: v.number(),
		lng: v.number(),
		year: v.number()
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const session = await ctx.db.get(args.sessionId);
		if (!session) fail('Fant ikke spillet.');
		if (session.status !== 'playing' || session.currentRoundIndex !== args.roundIndex)
			fail('Runden er ikke åpen for svar.');
		if (session.roundEndsAt !== undefined && now > session.roundEndsAt + GUESS_GRACE_MS)
			fail('Tiden er ute for denne runden.');

		const player = await findPlayer(ctx, session._id, args.clientId);
		if (!player) fail('Du er ikke med i dette spillet.');

		const { yearMin, yearMax } = session.settings;
		if (!Number.isInteger(args.year) || args.year < yearMin || args.year > yearMax)
			fail(`Året må være mellom ${yearMin} og ${yearMax}.`);
		if (!isValidLatLng(args.lat, args.lng)) fail('Ugyldig plassering.');

		const existing = await ctx.db
			.query('guesses')
			.withIndex('by_player_round', (q) =>
				q.eq('playerId', player._id).eq('roundIndex', args.roundIndex)
			)
			.unique();
		if (existing) fail('Du har allerede svart på denne runden.');

		await ctx.db.insert('guesses', {
			sessionId: session._id,
			roundIndex: args.roundIndex,
			playerId: player._id,
			lat: args.lat,
			lng: args.lng,
			year: args.year,
			submittedAt: now,
			responseMs: Math.max(0, now - (session.roundStartedAt ?? now))
		});
		await ctx.db.patch(player._id, { lastSeenAt: now });
		await revealIfEveryoneAnswered(ctx, session);
	}
});

/**
 * Everything a player's phone needs, keyed by join code. Answers and other
 * players' guesses are only included after the round is revealed.
 */
export const state = query({
	args: { code: v.string(), clientId: v.string() },
	handler: async (ctx, { code, clientId }) => {
		const sessions = await sessionsForCode(ctx, code);
		let session: Doc<'sessions'> | undefined;
		let me: Doc<'players'> | null = null;
		for (const s of sessions) {
			const player = await findPlayer(ctx, s._id, clientId);
			if (player) {
				session = s;
				me = player;
				break;
			}
		}
		session ??= sessions.find((s) => s.status !== 'finished');
		if (!session) return null;

		const { guessByPlayer, ...view } = await buildSessionView(ctx, session, Date.now());
		const myGuess = me ? guessByPlayer.get(me._id) : undefined;
		const myStanding = me ? view.standings.find((s) => s.playerId === me._id) : undefined;

		return {
			session: view.session,
			me: me
				? {
						_id: me._id,
						name: me.name,
						totalScore: me.totalScore,
						rank: myStanding?.rank ?? null
					}
				: null,
			standings: view.standings,
			playerCount: view.playerCount,
			answeredCount: view.answeredCount,
			activeCount: view.activeCount,
			round: view.round
				? {
						...view.round,
						myGuess: myGuess
							? {
									lat: myGuess.lat,
									lng: myGuess.lng,
									year: myGuess.year,
									submittedAt: myGuess.submittedAt
								}
							: null
					}
				: null
		};
	}
});
