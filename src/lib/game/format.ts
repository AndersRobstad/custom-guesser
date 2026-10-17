const points = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });

/** 12345 → "12 345" */
export function formatPoints(value: number) {
	return points.format(value);
}

/** Distance in a human scale: "350 m", "4,2 km", "1 234 km". */
export function formatDistance(km: number) {
	if (km < 1) return `${Math.round(km * 1000)} m`;
	if (km < 10) return `${km.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} km`;
	return `${points.format(Math.round(km))} km`;
}

export function formatYearDiff(diff: number) {
	if (diff === 0) return 'Riktig år';
	return diff === 1 ? '1 år unna' : `${diff} år unna`;
}

/** Norwegian ordinal for placements: 1 → "1." */
export function ordinal(rank: number) {
	return `${rank}.`;
}
