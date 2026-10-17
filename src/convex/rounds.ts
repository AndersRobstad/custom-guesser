import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation } from './_generated/server';
import {
	CAPTION_MAX_LENGTH,
	LABEL_MAX_LENGTH,
	MAX_ROUND_SECONDS,
	isValidLatLng
} from '../lib/game';
import { activeSessionsForGame, fail, listRounds, requireOwnedGame } from './model';

const roundFields = {
	imageId: v.id('_storage'),
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

export const generateUploadUrl = mutation({
	args: { clientId: v.string() },
	handler: async (ctx, { clientId }) => {
		if (!clientId) fail('Mangler klient-id.');
		return ctx.storage.generateUploadUrl();
	}
});

export const create = mutation({
	args: { gameId: v.id('games'), clientId: v.string(), ...roundFields },
	handler: async (ctx, { gameId, clientId, imageId, ...input }) => {
		const game = await requireOwnedGame(ctx, gameId, clientId);
		if (!(await ctx.db.system.get(imageId))) fail('Bildet mangler. Last det opp på nytt.');
		const fields = validateRound(game, input);
		const rounds = await listRounds(ctx, game._id);
		const order = rounds.length === 0 ? 0 : rounds[rounds.length - 1].order + 1;
		const roundId = await ctx.db.insert('rounds', { gameId, order, imageId, ...fields });
		await ctx.db.patch(game._id, { updatedAt: Date.now() });
		return roundId;
	}
});

export const update = mutation({
	args: { roundId: v.id('rounds'), clientId: v.string(), ...roundFields },
	handler: async (ctx, { roundId, clientId, imageId, ...input }) => {
		const round = await ctx.db.get(roundId);
		if (!round) fail('Fant ikke runden.');
		const game = await requireOwnedGame(ctx, round.gameId, clientId);
		const fields = validateRound(game, input);
		if (imageId !== round.imageId) {
			if (!(await ctx.db.system.get(imageId))) fail('Bildet mangler. Last det opp på nytt.');
			await ctx.storage.delete(round.imageId);
		}
		// `replace` so cleared optional fields (label, caption, time) are removed.
		await ctx.db.replace(round._id, {
			gameId: round.gameId,
			order: round.order,
			imageId,
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
