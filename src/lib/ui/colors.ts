/**
 * Player identity colors. Each player keeps one color everywhere (chips, pins,
 * result lines). Picked to read on cyanotype blue and on map tiles; orange is
 * reserved for the date stamp / answer, so it's deliberately absent.
 */
export const PLAYER_COLORS = [
	'#ffd23f', // sol
	'#ff7eb6', // rosa
	'#3ddc97', // mynte
	'#7bdff2', // himmel
	'#c9a7ff', // lilla
	'#b8f35b', // lime
	'#ffb38a', // fersken
	'#f3f6ff' // papir
] as const;

/** Stable color per player based on join order. */
export function playerColors<T extends { playerId: string; joinedAt: number }>(players: T[]) {
	const sorted = [...players].sort((a, b) => a.joinedAt - b.joinedAt);
	return new Map(sorted.map((p, i) => [p.playerId, PLAYER_COLORS[i % PLAYER_COLORS.length]]));
}

/** Readable initials for pins and avatars. */
export function initials(name: string) {
	const parts = name.trim().split(/\s+/);
	const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
	return letters.toLocaleUpperCase('nb-NO');
}
