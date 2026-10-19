/**
 * Game rules and constants shared by the Convex backend and the UI.
 * Pure module: safe to import from both `src/convex/` and Svelte code.
 */
import { DEFAULT_K_YEAR, DEFAULT_PRESET, PRESETS, type PresetKey } from './scoring';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
/**
 * Codes are unique among unfinished sessions, and also aren't handed out again
 * until a day after a session finished, so old /play links and stored ids keep
 * pointing at the right game.
 */
export const CODE_REUSE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const NAME_MAX_LENGTH = 20;
export const TITLE_MAX_LENGTH = 60;
export const LABEL_MAX_LENGTH = 120;
export const CAPTION_MAX_LENGTH = 280;

/** Players send a heartbeat this often… */
export const HEARTBEAT_INTERVAL_MS = 15_000;
/** …and count as active for "everyone has answered" if seen within this window. */
export const ACTIVE_WINDOW_MS = 45_000;
/** Late guesses are accepted this long after `roundEndsAt` to absorb network latency. */
export const GUESS_GRACE_MS = 1_000;

/** Media limits. Images are compressed in the browser; videos can't be, so they're capped. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export type MediaType = 'image' | 'video';

export const DEFAULT_ROUND_SECONDS = 60;
export const MAX_ROUND_SECONDS = 600;
export const ROUND_SECONDS_OPTIONS = [0, 10, 20, 30, 45, 60, 90, 120, 180] as const;
export const DEFAULT_YEAR_MIN = 1999;
export const YEAR_LOWER_BOUND = 1800;
export const YEAR_UPPER_BOUND = 2100;

export type SessionStatus = 'lobby' | 'playing' | 'reveal' | 'finished';
export type ScoringPresetKey = PresetKey | 'custom';

export interface ScoringSettings {
	preset: ScoringPresetKey;
	perfectKm: number;
	kKm: number;
	kYear: number;
}

export interface GameSettings {
	/** Default time limit per round in seconds; 0 means no timer. */
	roundSeconds: number;
	yearMin: number;
	yearMax: number;
	scoring: ScoringSettings;
	hostPlays: boolean;
	/** Shuffle the rounds for every new session; the order is fixed per session, so all players share it. */
	shuffleRounds?: boolean;
}

export function defaultScoring(preset: PresetKey = DEFAULT_PRESET): ScoringSettings {
	const { perfectKm, kKm } = PRESETS[preset];
	return { preset, perfectKm, kKm, kYear: DEFAULT_K_YEAR };
}

/** `currentYear` is passed in so this stays deterministic. */
export function defaultSettings(currentYear: number): GameSettings {
	return {
		roundSeconds: DEFAULT_ROUND_SECONDS,
		yearMin: DEFAULT_YEAR_MIN,
		yearMax: currentYear,
		scoring: defaultScoring(),
		hostPlays: false,
		shuffleRounds: false
	};
}

/** Fisher–Yates shuffle into a new array; `random` is injectable for deterministic tests. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Upper-case and strip whitespace/dashes so "ab c-123" matches "ABC123". */
export function normalizeCode(input: string): string {
	return input.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidCode(code: string): boolean {
	if (code.length !== CODE_LENGTH) return false;
	for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
	return true;
}

export function generateCode(random: () => number = Math.random): string {
	let code = '';
	for (let i = 0; i < CODE_LENGTH; i++) {
		code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
	}
	return code;
}

/** Trim and collapse inner whitespace. */
export function normalizeName(input: string): string {
	return input.trim().replace(/\s+/g, ' ');
}

export function nameKey(name: string): string {
	return normalizeName(name).toLocaleLowerCase('nb-NO');
}

/** Returns a Norwegian error message, or null if the name is acceptable. */
export function validateName(input: string): string | null {
	const name = normalizeName(input);
	if (name.length === 0) return 'Skriv inn et navn.';
	if ([...name].length > NAME_MAX_LENGTH) return `Navnet kan være maks ${NAME_MAX_LENGTH} tegn.`;
	return null;
}

/** Effective time limit for a round: the round override wins over the game default. */
export function effectiveRoundSeconds(
	settings: Pick<GameSettings, 'roundSeconds'>,
	roundSeconds: number | undefined
): number {
	return roundSeconds ?? settings.roundSeconds;
}

export function isValidLatLng(lat: number, lng: number): boolean {
	return (
		Number.isFinite(lat) &&
		Number.isFinite(lng) &&
		lat >= -90 &&
		lat <= 90 &&
		lng >= -180 &&
		lng <= 180
	);
}

/** Validates game settings; returns a Norwegian error message or null. */
export function validateSettings(s: GameSettings): string | null {
	if (!Number.isInteger(s.roundSeconds) || s.roundSeconds < 0 || s.roundSeconds > MAX_ROUND_SECONDS)
		return `Tidsgrensen må være mellom 0 og ${MAX_ROUND_SECONDS} sekunder.`;
	if (!Number.isInteger(s.yearMin) || !Number.isInteger(s.yearMax))
		return 'Årstallene må være hele tall.';
	if (s.yearMin < YEAR_LOWER_BOUND || s.yearMax > YEAR_UPPER_BOUND)
		return `Årstallene må være mellom ${YEAR_LOWER_BOUND} og ${YEAR_UPPER_BOUND}.`;
	if (s.yearMin > s.yearMax) return 'Fra-år kan ikke være etter til-år.';
	const { perfectKm, kKm, kYear } = s.scoring;
	if (!(perfectKm >= 0) || !(kKm > 0) || !(kYear > 0)) return 'Ugyldige poengparametre.';
	return null;
}

export interface RankedEntry {
	totalScore: number;
	totalResponseMs: number;
	joinedAt: number;
}

/** Highest total first; ties broken by lowest accumulated response time, then join order. */
export function compareStandings(a: RankedEntry, b: RankedEntry): number {
	return (
		b.totalScore - a.totalScore || a.totalResponseMs - b.totalResponseMs || a.joinedAt - b.joinedAt
	);
}
