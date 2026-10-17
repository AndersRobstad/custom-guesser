export type LatLng = { lat: number; lng: number };

export interface MapMarker extends LatLng {
	id: string;
	/** `answer` = the orange Glimt pin, `guess` = a player pin, `draft` = the pin being placed. */
	kind: 'answer' | 'guess' | 'draft';
	color?: string;
	/** Short text inside the pin (initials). */
	text?: string;
	/** Tooltip / accessible label. */
	label?: string;
	highlight?: boolean;
}

export interface MapLine {
	from: LatLng;
	to: LatLng;
	color?: string;
}

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const DEFAULT_CENTER: LatLng = { lat: 54, lng: 12 };
export const DEFAULT_ZOOM = 3;
