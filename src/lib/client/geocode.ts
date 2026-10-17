/**
 * Place search via OpenStreetMap Nominatim. Callers must debounce (≥ 1 req/s per
 * the usage policy) and abort stale requests; browsers send the Referer, which
 * identifies the app since a custom User-Agent can't be set from the browser.
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org';

export interface Place {
	id: string;
	/** Short label like "Rethymno, Kreta". */
	label: string;
	/** Full OSM display name. */
	description: string;
	lat: number;
	lng: number;
}

interface NominatimResult {
	place_id: number;
	lat: string;
	lon: string;
	name?: string;
	display_name: string;
	address?: Record<string, string>;
}

function shortLabel(r: NominatimResult): string {
	const a = r.address ?? {};
	const name =
		r.name || a.city || a.town || a.village || a.municipality || r.display_name.split(',')[0];
	let region = a.state ?? a.county ?? a.country;
	if (!region || region === name) region = a.country;
	return region && region !== name ? `${name}, ${region}` : name;
}

function toPlace(r: NominatimResult): Place {
	return {
		id: String(r.place_id),
		label: shortLabel(r),
		description: r.display_name,
		lat: Number(r.lat),
		lng: Number(r.lon)
	};
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
	const params = new URLSearchParams({
		format: 'jsonv2',
		addressdetails: '1',
		limit: '6',
		'accept-language': 'nb,no,en',
		q: query
	});
	const res = await fetch(`${NOMINATIM}/search?${params}`, {
		signal,
		headers: { Accept: 'application/json' }
	});
	if (!res.ok) throw new Error(`Nominatim ${res.status}`);
	return ((await res.json()) as NominatimResult[]).map(toPlace);
}

export async function reverseGeocode(
	lat: number,
	lng: number,
	signal?: AbortSignal
): Promise<Place | null> {
	const params = new URLSearchParams({
		format: 'jsonv2',
		addressdetails: '1',
		zoom: '12',
		'accept-language': 'nb,no,en',
		lat: String(lat),
		lon: String(lng)
	});
	const res = await fetch(`${NOMINATIM}/reverse?${params}`, {
		signal,
		headers: { Accept: 'application/json' }
	});
	if (!res.ok) return null;
	const data = (await res.json()) as NominatimResult & { error?: string };
	return data.error ? null : toPlace(data);
}
