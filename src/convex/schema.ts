import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { mediaTypeValidator, sessionStatusValidator, settingsValidator } from './validators';

export default defineSchema({
	/** A game is the template: title, settings and an ordered list of rounds. */
	games: defineTable({
		ownerClientId: v.string(),
		title: v.string(),
		settings: settingsValidator,
		createdAt: v.number(),
		updatedAt: v.optional(v.number())
	}).index('by_owner', ['ownerClientId']),

	rounds: defineTable({
		gameId: v.id('games'),
		order: v.number(),
		/** The round's media file: an image, or a video when `mediaType` is 'video'. */
		imageId: v.id('_storage'),
		mediaType: v.optional(mediaTypeValidator),
		/** Still frame for video rounds; phones show this until the player taps play. */
		posterId: v.optional(v.id('_storage')),
		answerYear: v.number(),
		answerLat: v.number(),
		answerLng: v.number(),
		answerLabel: v.optional(v.string()),
		caption: v.optional(v.string()),
		/** Per-image time limit in seconds; overrides `settings.roundSeconds` (0 = no timer). */
		roundSeconds: v.optional(v.number())
	}).index('by_game_order', ['gameId', 'order']),

	/** One play-through of a game, with its own join code and players. */
	sessions: defineTable({
		gameId: v.id('games'),
		hostClientId: v.string(),
		code: v.string(),
		status: sessionStatusValidator,
		currentRoundIndex: v.number(),
		roundStartedAt: v.optional(v.number()),
		roundEndsAt: v.optional(v.number()),
		revealedAt: v.optional(v.number()),
		createdAt: v.number(),
		finishedAt: v.optional(v.number()),
		/** Snapshot taken when the session is created, so editing the game can't break a running session. */
		title: v.string(),
		settings: settingsValidator,
		roundIds: v.array(v.id('rounds')),
		scheduledRevealId: v.optional(v.id('_scheduled_functions'))
	})
		.index('by_code', ['code'])
		.index('by_host', ['hostClientId'])
		.index('by_game', ['gameId']),

	players: defineTable({
		sessionId: v.id('sessions'),
		clientId: v.string(),
		name: v.string(),
		/** Lower-cased name for case-insensitive uniqueness. */
		nameKey: v.string(),
		totalScore: v.number(),
		/** Sum of response times, used to break ties. */
		totalResponseMs: v.number(),
		joinedAt: v.number()
	})
		.index('by_session', ['sessionId'])
		.index('by_session_client', ['sessionId', 'clientId']),

	/**
	 * Heartbeats (`lastSeenAt`) for players and the host. Kept out of `players`
	 * and `sessions` on purpose: every heartbeat would otherwise invalidate every
	 * live screen's query. Only the host view and the "everyone answered" check
	 * read the whole table; players only read the host's row.
	 */
	presence: defineTable({
		sessionId: v.id('sessions'),
		clientId: v.string(),
		role: v.union(v.literal('host'), v.literal('player')),
		playerId: v.optional(v.id('players')),
		lastSeenAt: v.number()
	})
		.index('by_session', ['sessionId'])
		.index('by_session_client', ['sessionId', 'clientId']),

	guesses: defineTable({
		sessionId: v.id('sessions'),
		roundIndex: v.number(),
		playerId: v.id('players'),
		lat: v.number(),
		lng: v.number(),
		year: v.number(),
		submittedAt: v.number(),
		responseMs: v.number(),
		/** Filled in by the reveal mutation; undefined while the round is open. */
		distanceKm: v.optional(v.number()),
		yearDiff: v.optional(v.number()),
		locationScore: v.optional(v.number()),
		yearScore: v.optional(v.number())
	})
		.index('by_session_round', ['sessionId', 'roundIndex'])
		.index('by_player_round', ['playerId', 'roundIndex'])
});
