import { v } from 'convex/values';

export const scoringValidator = v.object({
	preset: v.union(
		v.literal('city'),
		v.literal('region'),
		v.literal('norway'),
		v.literal('europe'),
		v.literal('world'),
		v.literal('custom')
	),
	perfectKm: v.number(),
	kKm: v.number(),
	kYear: v.number()
});

export const settingsValidator = v.object({
	roundSeconds: v.number(),
	yearMin: v.number(),
	yearMax: v.number(),
	scoring: scoringValidator,
	hostPlays: v.boolean(),
	/** Shuffle the rounds for every new session (all players share that session's order). */
	shuffleRounds: v.optional(v.boolean())
});

export const sessionStatusValidator = v.union(
	v.literal('lobby'),
	v.literal('playing'),
	v.literal('reveal'),
	v.literal('finished')
);

export const mediaTypeValidator = v.union(v.literal('image'), v.literal('video'));
