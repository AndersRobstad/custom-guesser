import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, type MutationCtx } from './_generated/server';
import {
	CAPTION_MAX_LENGTH,
	LABEL_MAX_LENGTH,
	MAX_IMAGE_BYTES,
	MAX_ROUND_SECONDS,
	MAX_VIDEO_BYTES,
	isValidLatLng,
	type MediaType
} from '../lib/game';
import { activeSessionsForGame, fail, listRounds, requireOwnedGame } from './model';
import { mediaTypeValidator } from './validators';

const roundFields = {
	imageId: v.id('_storage'),
	mediaType: v.optional(mediaTypeValidator),
	posterId: v.optional(v.id('_storage')),
	answerYear: v.number(),
	answerLat: v.number(),
	answerLng: v.number(),
	answerLabel: v.optional(v.string()),
	caption: v.optional(v.string()),
	roundSeconds: v.optional(v.number())
};

interface RoundInput {
	answerYear: number;
	answerLat: number;
	answerLng: number;
	answerLabel?: string;
	caption?: string;
	roundSeconds?: number;
}

function optionalText(raw: string | undefined, max: number, what: string) {
	const text = raw?.trim();
	if (!text) return undefined;
	if (text.length > max) fail(`${what} kan være maks ${max} tegn.`);
	return text;
}

/** A round can't be saved without image, year and coordinates; validates the rest too. */
function validateRound(game: Doc<'games'>, input: RoundInput) {
	const { yearMin, yearMax } = game.settings;
	if (!Number.isInteger(input.answerYear)) fail('Velg et årstall for bildet.');
	if (input.answerYear < yearMin || input.answerYear > yearMax)
		fail(`Året må være mellom ${yearMin} og ${yearMax} (se spillinnstillingene).`);
	if (!isValidLatLng(input.answerLat, input.answerLng))
		fail('Sett en gyldig plassering på kartet.');
	if (
		input.roundSeconds !== undefined &&
		(!Number.isInteger(input.roundSeconds) ||
			input.roundSeconds < 0 ||
			input.roundSeconds > MAX_ROUND_SECONDS)
	)
		fail(`Tidsgrensen må være mellom 0 og ${MAX_ROUND_SECONDS} sekunder.`);
	return {
		answerYear: input.answerYear,
		answerLat: input.answerLat,
		answerLng: input.answerLng,
		answerLabel: optionalText(input.answerLabel, LABEL_MAX_LENGTH, 'Stedsnavnet'),
		caption: optionalText(input.caption, CAPTION_MAX_LENGTH, 'Bildeteksten'),
		roundSeconds: input.roundSeconds
	};
}

/**
 * Checks the uploaded files against the media limits. Videos aren't compressed
 * in the browser, so they're capped at 50 MB and need a poster frame for phones.
 */
async function validateMedia(
	ctx: MutationCtx,
	mediaType: MediaType,
	imageId: Id<'_storage'>,
	posterId: Id<'_storage'> | undefined
) {
	const file = await ctx.db.system.get(imageId);
	if (!file) fail('Filen mangler. Last den opp på nytt.');
	const type = file.contentType ?? '';
	if (mediaType === 'video') {
		if (type && !type.startsWith('video/')) fail('Filen er ikke en video.');
		if (file.size > MAX_VIDEO_BYTES)
			fail(`Videoen er for stor. Maks ${MAX_VIDEO_BYTES / 1024 / 1024} MB.`);
		if (!posterId || !(await ctx.db.system.get(posterId)))
			fail('Videoen mangler et stillbilde. Last den opp på nytt.');
		return { mediaType, posterId };
	}
	if (type && !type.startsWith('image/')) fail('Filen er ikke et bilde.');
	if (file.size > MAX_IMAGE_BYTES)
		fail(`Bildet er for stort. Maks ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
	return { mediaType: undefined, posterId: undefined };
}

export const generateUploadUrl = mutation({
	args: { clientId: v.string() },
	handler: async (ctx, { clientId }) => {
		if (!clientId) fail('Mangler klient-id.');
		return ctx.storage.generateUploadUrl();
	}
});

export const create = mutation({
	args: { gameId: v.id('games'), clientId: v.string(), ...roundFields },
	handler: async (ctx, { gameId, clientId, imageId, mediaType, posterId, ...input }) => {
		const game = await requireOwnedGame(ctx, gameId, clientId);
		const media = await validateMedia(ctx, mediaType ?? 'image', imageId, posterId);
		const fields = validateRound(game, input);
		const rounds = await listRounds(ctx, game._id);
		const order = rounds.length === 0 ? 0 : rounds[rounds.length - 1].order + 1;
		const roundId = await ctx.db.insert('rounds', {
			gameId,
			order,
			imageId,
			...media,
			...fields
		});
		await ctx.db.patch(game._id, { updatedAt: Date.now() });
		return roundId;
	}
});

export const update = mutation({
	args: { roundId: v.id('rounds'), clientId: v.string(), ...roundFields },
	handler: async (ctx, { roundId, clientId, imageId, mediaType, posterId, ...input }) => {
		const round = await ctx.db.get(roundId);
		if (!round) fail('Fant ikke runden.');
		const game = await requireOwnedGame(ctx, round.gameId, clientId);
		const fields = validateRound(game, input);
		const media = await validateMedia(ctx, mediaType ?? 'image', imageId, posterId);
		// Clean up files that are no longer referenced.
		if (imageId !== round.imageId) await ctx.storage.delete(round.imageId);
		if (round.posterId && round.posterId !== media.posterId)
			await ctx.storage.delete(round.posterId);
		// `replace` so cleared optional fields (label, caption, time, poster) are removed.
		await ctx.db.replace(round._id, {
			gameId: round.gameId,
			order: round.order,
			imageId,
			...media,
			...fields
		});
		await ctx.db.patch(game._id, { updatedAt: Date.now() });
	}
});

export const remove = mutation({
	args: { roundId: v.id('rounds'), clientId: v.string() },
	handler: async (ctx, { roundId, clientId }) => {
		const round = await ctx.db.get(roundId);
		if (!round) return;
		const game = await requireOwnedGame(ctx, round.gameId, clientId);
		if ((await activeSessionsForGame(ctx, game)).length > 0)
			fail('Du kan ikke slette runder mens en økt pågår.');
		await ctx.storage.delete(round.imageId);
		if (round.posterId) await ctx.storage.delete(round.posterId);
		await ctx.db.delete(round._id);
		const rest = await listRounds(ctx, game._id);
		for (const [i, r] of rest.entries()) if (r.order !== i) await ctx.db.patch(r._id, { order: i });
		await ctx.db.patch(game._id, { updatedAt: Date.now() });
	}
});

export const reorder = mutation({
	args: { gameId: v.id('games'), clientId: v.string(), roundIds: v.array(v.id('rounds')) },
	handler: async (ctx, { gameId, clientId, roundIds }) => {
		const game = await requireOwnedGame(ctx, gameId, clientId);
		const rounds = await listRounds(ctx, game._id);
		const known = new Set(rounds.map((r) => r._id));
		if (roundIds.length !== rounds.length || new Set(roundIds).size !== roundIds.length)
			fail('Rekkefølgen må inneholde alle rundene nøyaktig én gang.');
		if (!roundIds.every((id) => known.has(id))) fail('Ukjent runde i rekkefølgen.');
		for (const [i, id] of roundIds.entries()) await ctx.db.patch(id, { order: i });
		await ctx.db.patch(game._id, { updatedAt: Date.now() });
	}
});
