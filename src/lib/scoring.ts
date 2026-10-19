/**
 * Pure, deterministic scoring shared by the Convex backend, the UI and the tests.
 * No clocks, no IO — every function is a plain calculation.
 */

export const EARTH_RADIUS_KM = 6371;
/** Max points per category (location and year), so a round is worth up to 10 000. */
export const MAX_SCORE = 5000;
export const DEFAULT_K_YEAR = 4;

export type PresetKey = 'city' | 'region' | 'norway' | 'europe' | 'world';

export interface LocationScoring {
	/** Distance (km) that still counts as a perfect hit. */
	perfectKm: number;
	/** Decay constant (km): every kKm beyond perfectKm divides the score by e. */
	kKm: number;
}

export interface ScoringParams extends LocationScoring {
	/** Decay constant (years) for the year score. */
	kYear: number;
}

export interface Preset extends LocationScoring {
	key: PresetKey;
	label: string;
	description: string;
}

export const PRESETS: Record<PresetKey, Preset> = {
	city: {
		key: 'city',
		label: 'By',
		description: 'Alle bildene er fra samme by',
		perfectKm: 0.05,
		kKm: 3
	},
	region: {
		key: 'region',
		label: 'Landsdel',
		description: 'Bildene er fra én landsdel eller region',
		perfectKm: 0.5,
		kKm: 30
	},
	norway: {
		key: 'norway',
		label: 'Norge',
		description: 'Bildene er spredt rundt i Norge',
		perfectKm: 1,
		kKm: 100
	},
	europe: {
		key: 'europe',
		label: 'Europa',
		description: 'Bildene er fra hele Europa',
		perfectKm: 5,
		kKm: 500
	},
	world: {
		key: 'world',
		label: 'Verden',
		description: 'Bildene er fra hele verden',
		perfectKm: 25,
		kKm: 2000
	}
};

export const DEFAULT_PRESET: PresetKey = 'europe';

export type YearStrictness = 'lenient' | 'normal' | 'strict';

/** How hard a wrong year is punished. Stored as `kYear` in the game's scoring settings. */
export const YEAR_STRICTNESS: Record<
	YearStrictness,
	{ key: YearStrictness; label: string; description: string; kYear: number }
> = {
	lenient: {
		key: 'lenient',
		label: 'Snill',
		description: 'Et par år feil koster lite',
		kYear: 8
	},
	normal: {
		key: 'normal',
		label: 'Normal',
		description: 'Hvert år feil koster merkbart',
		kYear: DEFAULT_K_YEAR
	},
	strict: {
		key: 'strict',
		label: 'Streng',
		description: 'Bare riktig år gir fulle poeng – bom koster mye',
		kYear: 2
	}
};

/** The named strictness for a `kYear`, or null for a custom value. */
export function yearStrictnessFor(kYear: number): YearStrictness | null {
	const match = Object.values(YEAR_STRICTNESS).find((s) => s.kYear === kYear);
	return match?.key ?? null;
}

export function presetScoring(key: PresetKey, kYear = DEFAULT_K_YEAR): ScoringParams {
	const { perfectKm, kKm } = PRESETS[key];
	return { perfectKm, kKm, kYear };
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km between two lat/lng points (haversine, R = 6371 km). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	// Floating point can push `a` a hair outside [0, 1] near antipodes.
	const clamped = Math.min(1, Math.max(0, a));
	return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
}

function clampScore(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(MAX_SCORE, Math.max(0, Math.round(value)));
}

/** 5000 inside the perfect radius, then exponential decay with constant kKm. */
export function locationScore(distanceKm: number, { perfectKm, kKm }: LocationScoring): number {
	const d = Math.max(0, distanceKm);
	if (d <= perfectKm) return MAX_SCORE;
	if (kKm <= 0) return 0;
	return clampScore(MAX_SCORE * Math.exp(-(d - perfectKm) / kKm));
}

/** 5000 for the right year, exponential decay with constant kYear. */
export function yearScore(yearDiff: number, { kYear }: Pick<ScoringParams, 'kYear'>): number {
	const delta = Math.abs(yearDiff);
	if (delta === 0) return MAX_SCORE;
	if (kYear <= 0) return 0;
	return clampScore(MAX_SCORE * Math.exp(-delta / kYear));
}

export interface GuessInput {
	lat: number;
	lng: number;
	year: number;
}

export interface GuessScore {
	distanceKm: number;
	yearDiff: number;
	locationScore: number;
	yearScore: number;
	total: number;
}

export function scoreGuess(
	guess: GuessInput,
	answer: GuessInput,
	params: ScoringParams
): GuessScore {
	const distanceKm = haversineKm(guess.lat, guess.lng, answer.lat, answer.lng);
	const yearDiff = Math.abs(guess.year - answer.year);
	const loc = locationScore(distanceKm, params);
	const yr = yearScore(yearDiff, params);
	return { distanceKm, yearDiff, locationScore: loc, yearScore: yr, total: loc + yr };
}
