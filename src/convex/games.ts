import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { TITLE_MAX_LENGTH, defaultSettings, validateSettings } from '../lib/game';
import { activeSessionsForGame, fail, listRounds, mediaUrls, requireOwnedGame } from './model';
import { settingsValidator } from './validators';

function cleanTitle(raw: string) {
	const title = raw.trim().replace(/\s+/g, ' ');
	if (title.length === 0) fail('Spillet må ha en tittel.');
	if (title.length > TITLE_MAX_LENGTH) fail(`Tittelen kan være maks ${TITLE_MAX_LENGTH} tegn.`);
	return title;
}

/** The host's own games, newest first, with round count, cover image and any running session. */
export const listMine = query({
	args: { clientId: v.string() },
	handler: async (ctx, { clientId }) => {
		const games = await ctx.db
			.query('games')
			.withIndex('by_owner', (q) => q.eq('ownerClientId', clientId))
			.order('desc')
			.collect();
		const sessions = await ctx.db
			.query('sessions')
			.withIndex('by_host', (q) => q.eq('hostClientId', clientId))
			.collect();

		return Promise.all(
			games.map(async (game) => {
				const rounds = await listRounds(ctx, game._id);
				const own = sessions.filter((s) => s.gameId === game._id);
				const active = own
					.filter((s) => s.status !== 'finished')
					.sort((a, b) => b.createdAt - a.createdAt)[0];
				return {
					_id: game._id,
					title: game.title,
					createdAt: game.createdAt,
					updatedAt: game.updatedAt ?? game.createdAt,
					roundCount: rounds.length,
					coverUrl: rounds[0] ? (await mediaUrls(ctx, rounds[0])).imageUrl : null,
					timesPlayed: own.length,
					activeSession: active
						? { _id: active._id, code: active.code, status: active.status }
						: null
				};
			})
		);
	}
});

/** Full game with answers — only for the owner. Returns null for unknown ids. */
export const get = query({
	args: { gameId: v.string(), clientId: v.string() },
	handler: async (ctx, args) => {
		const gameId = ctx.db.normalizeId('games', args.gameId);
		if (!gameId) return null;
		const game = await ctx.db.get(gameId);
		if (!game || game.ownerClientId !== args.clientId) return null;
		const rounds = await listRounds(ctx, game._id);
		const active = await activeSessionsForGame(ctx, game);
		return {
			game: {
				_id: game._id,
				title: game.title,
				settings: game.settings,
				createdAt: game.createdAt
			},
			rounds: await Promise.all(
				rounds.map(async (r) => ({
					_id: r._id,
					order: r.order,
					imageId: r.imageId,
					posterId: r.posterId ?? null,
					...(await mediaUrls(ctx, r)),
					answerYear: r.answerYear,
					answerLat: r.answerLat,
					answerLng: r.answerLng,
					answerLabel: r.answerLabel ?? null,
					caption: r.caption ?? null,
					roundSeconds: r.roundSeconds ?? null
				}))
			),
			activeSession: active[0] ? { _id: active[0]._id, code: active[0].code } : null
		};
	}
});

export const create = mutation({
	args: { clientId: v.string(), title: v.optional(v.string()) },
	handler: async (ctx, { clientId, title }) => {
		if (!clientId) fail('Mangler klient-id.');
		const now = Date.now();
		return ctx.db.insert('games', {
			ownerClientId: clientId,
			title: cleanTitle(title ?? 'Nytt spill'),
			settings: defaultSettings(new Date(now).getUTCFullYear()),
			createdAt: now,
			updatedAt: now
		});
	}
});

export const update = mutation({
	args: {
		gameId: v.id('games'),
		clientId: v.string(),
		title: v.optional(v.string()),
		settings: v.optional(settingsValidator)
	},
	handler: async (ctx, { gameId, clientId, title, settings }) => {
		const game = await requireOwnedGame(ctx, gameId, clientId);
		const patch: { title?: string; settings?: typeof settings; updatedAt: number } = {
			updatedAt: Date.now()
		};
		if (title !== undefined) patch.title = cleanTitle(title);
		if (settings !== undefined) {
			const error = validateSettings(settings);
			if (error) fail(error);
			const outside = (await listRounds(ctx, game._id)).find(
				(r) => r.answerYear < settings.yearMin || r.answerYear > settings.yearMax
			);
			if (outside)
				fail(
					`Runde ${outside.order + 1} er fra ${outside.answerYear}, som er utenfor ${settings.yearMin}–${settings.yearMax}.`
				);
			patch.settings = settings;
		}
		await ctx.db.patch(game._id, patch);
	}
});

export const remove = mutation({
	args: { gameId: v.id('games'), clientId: v.string() },
	handler: async (ctx, { gameId, clientId }) => {
		const game = await requireOwnedGame(ctx, gameId, clientId);
		if ((await activeSessionsForGame(ctx, game)).length > 0)
			fail('Avslutt den pågående økten før du sletter spillet.');

		for (const round of await listRounds(ctx, game._id)) {
			await ctx.storage.delete(round.imageId);
			if (round.posterId) await ctx.storage.delete(round.posterId);
			await ctx.db.delete(round._id);
		}
		const sessions = await ctx.db
			.query('sessions')
			.withIndex('by_host', (q) => q.eq('hostClientId', clientId))
			.collect();
		for (const session of sessions.filter((s) => s.gameId === game._id)) {
			const players = await ctx.db
				.query('players')
				.withIndex('by_session', (q) => q.eq('sessionId', session._id))
				.collect();
			for (const player of players) {
				const guesses = await ctx.db
					.query('guesses')
					.withIndex('by_player_round', (q) => q.eq('playerId', player._id))
					.collect();
				for (const guess of guesses) await ctx.db.delete(guess._id);
				await ctx.db.delete(player._id);
			}
			await ctx.db.delete(session._id);
		}
		await ctx.db.delete(game._id);
	}
});
