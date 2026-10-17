/** Small Norwegian formatting helpers for the game builder. */

const numberFormat = new Intl.NumberFormat('nb-NO');
const listFormat = new Intl.ListFormat('nb-NO', { type: 'conjunction' });

/** "4 570" (with a non-breaking thin space, as Norwegian expects). */
export function formatNumber(value: number): string {
	return numberFormat.format(value);
}

/** Round time limit: 0 is "no limit". */
export function formatSeconds(seconds: number): string {
	return seconds === 0 ? 'Ingen' : `${seconds} s`;
}

/** "50 m" below a kilometre, otherwise "5 km". */
export function formatDistance(km: number): string {
	return km < 1 ? `${formatNumber(Math.round(km * 1000))} m` : `${formatNumber(km)} km`;
}

/** "1 bilde" / "3 bilder". */
export function countLabel(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

export function timesPlayedLabel(count: number): string {
	if (count === 0) return 'Ikke spilt ennå';
	return count === 1 ? 'Spilt 1 gang' : `Spilt ${count} ganger`;
}

/** "år og plassering" */
export function joinList(items: string[]): string {
	return listFormat.format(items);
}

function coordinate(value: number, positive: string, negative: string) {
	return `${Math.abs(value).toFixed(4).replace('.', ',')}° ${value >= 0 ? positive : negative}`;
}

/** "59,9139° N, 10,7522° Ø" */
export function formatLatLng(lat: number, lng: number): string {
	return `${coordinate(lat, 'N', 'S')}, ${coordinate(lng, 'Ø', 'V')}`;
}
