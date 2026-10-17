import type { LatLng } from '$lib/map/types';
import type { ScoringPresetKey } from '$lib/game';

/** Where a builder map opens before (and after) a pin is placed. */
export interface MapStart {
	center: LatLng;
	zoom: number;
	/** Zoom used when the map opens on an existing pin. */
	pinZoom: number;
}

const EUROPE: MapStart = { center: { lat: 52, lng: 12 }, zoom: 4, pinZoom: 6 };

const VIEWS: Record<ScoringPresetKey, MapStart> = {
	city: { center: { lat: 61, lng: 10 }, zoom: 5, pinZoom: 13 },
	norway: { center: { lat: 64.5, lng: 14 }, zoom: 4, pinZoom: 9 },
	europe: EUROPE,
	world: { center: { lat: 25, lng: 10 }, zoom: 2, pinZoom: 5 },
	custom: EUROPE
};

/**
 * Starting view for a new round: near the previous round if there is one
 * (handy for city games), otherwise a view that suits the map area preset.
 */
export function mapStart(
	preset: ScoringPresetKey,
	previous?: { answerLat: number; answerLng: number }
): MapStart {
	const view = VIEWS[preset];
	if (!previous) return view;
	return {
		center: { lat: previous.answerLat, lng: previous.answerLng },
		zoom: Math.max(view.zoom, view.pinZoom - 2),
		pinZoom: view.pinZoom
	};
}
