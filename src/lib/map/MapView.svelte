<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import type * as Leaflet from 'leaflet';
	import { untrack } from 'svelte';
	import { cn } from '$lib/ui/cn';
	import {
		DEFAULT_CENTER,
		DEFAULT_ZOOM,
		TILE_URL,
		type LatLng,
		type MapLine,
		type MapMarker
	} from './types';

	let {
		markers = [],
		lines = [],
		pickable = false,
		onpick,
		center = DEFAULT_CENTER,
		zoom = DEFAULT_ZOOM,
		fitTo,
		maxFitZoom = 12,
		focus,
		class: className,
		label = 'Kart',
		...rest
	}: {
		markers?: MapMarker[];
		lines?: MapLine[];
		/** Clicking/tapping the map reports a position through `onpick`. */
		pickable?: boolean;
		onpick?: (pos: LatLng) => void;
		center?: LatLng;
		zoom?: number;
		/** Points the map should keep in view; refits whenever the set changes. */
		fitTo?: LatLng[];
		maxFitZoom?: number;
		/** Pan/zoom to a point whenever it changes (e.g. a search result). */
		focus?: (LatLng & { zoom?: number }) | null;
		class?: string;
		label?: string;
		[key: `data-${string}`]: unknown;
	} = $props();

	let L = $state.raw<typeof Leaflet | null>(null);
	let map = $state.raw<Leaflet.Map | null>(null);

	function pinSvg(fill: string, text: string, ring: string) {
		return `<svg viewBox="0 0 32 40" width="32" height="40" aria-hidden="true">
			<path d="M16 39.2S3 24.8 3 15.2a13 13 0 0 1 26 0c0 9.6-13 24-13 24Z" fill="${fill}" stroke="${ring}" stroke-width="2"/>
			<text x="16" y="19.4" text-anchor="middle" font-size="11" font-weight="800" font-family="Schibsted Grotesk Variable, sans-serif" fill="#0f2a6e">${text}</text>
		</svg>`;
	}

	function answerSvg() {
		return `<svg viewBox="0 0 32 40" width="44" height="55" aria-hidden="true">
			<path d="M16 39.2S3 24.8 3 15.2a13 13 0 0 1 26 0c0 9.6-13 24-13 24Z" fill="#ff6a13" stroke="#fff" stroke-width="1.6"/>
			<circle cx="16" cy="15.2" r="7" fill="#0f2a6e"/>
			<circle cx="16" cy="15.2" r="3.6" fill="#ff6a13"/>
			<circle cx="14.7" cy="13.9" r="1" fill="#fff" opacity=".9"/>
		</svg>`;
	}

	function escapeHtml(s: string) {
		return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
	}

	function iconFor(lib: typeof Leaflet, m: MapMarker) {
		if (m.kind === 'answer') {
			return lib.divIcon({
				className: 'glimt-pin glimt-pin--answer',
				html: answerSvg(),
				iconSize: [44, 55],
				iconAnchor: [22, 54]
			});
		}
		const fill = m.kind === 'draft' ? '#eef3ff' : (m.color ?? '#eef3ff');
		const ring = m.highlight || m.kind === 'draft' ? '#0f2a6e' : 'rgba(15,42,110,.55)';
		return lib.divIcon({
			className: cn(
				'glimt-pin',
				m.kind === 'draft' && 'glimt-pin--draft',
				m.highlight && 'glimt-pin--me'
			),
			html: pinSvg(fill, escapeHtml(m.text ?? ''), ring),
			iconSize: [32, 40],
			iconAnchor: [16, 39]
		});
	}

	/** Creates the Leaflet map when the container mounts; tears it down on unmount. */
	function mountMap(node: HTMLDivElement) {
		let destroyed = false;
		let instance: Leaflet.Map | null = null;
		const resize = new ResizeObserver(() => instance?.invalidateSize());

		import('leaflet').then((mod) => {
			if (destroyed) return;
			const lib = ((mod as unknown as { default?: typeof Leaflet }).default ??
				mod) as typeof Leaflet;
			instance = lib.map(node, {
				worldCopyJump: true,
				zoomControl: true,
				attributionControl: true,
				minZoom: 2
			});
			instance.setView([center.lat, center.lng], zoom);
			lib
				.tileLayer(TILE_URL, {
					maxZoom: 19,
					attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
				})
				.addTo(instance);
			instance.attributionControl.setPrefix(false);
			instance.on('click', (e: Leaflet.LeafletMouseEvent) => {
				if (!pickable) return;
				const pos = e.latlng.wrap();
				onpick?.({ lat: pos.lat, lng: pos.lng });
			});
			resize.observe(node);
			L = lib;
			map = instance;
		});

		return () => {
			destroyed = true;
			resize.disconnect();
			// Stop pending pan/zoom animations first; removing mid-animation makes
			// Leaflet's queued frames hit a detached pane (`_leaflet_pos` errors).
			instance?.stop();
			instance?.off();
			instance?.remove();
			map = null;
		};
	}

	// Markers and lines are re-drawn as one layer, but only when their content
	// changes — parents often pass fresh arrays with identical data on every update.
	const layerKey = $derived(JSON.stringify([markers, lines]));

	$effect(() => {
		void layerKey;
		if (!map || !L) return;
		const lib = L;
		const [currentMarkers, currentLines] = untrack(() => [markers, lines] as const);
		const layer = lib.layerGroup().addTo(map);
		for (const line of currentLines) {
			lib
				.polyline(
					[
						[line.from.lat, line.from.lng],
						[line.to.lat, line.to.lng]
					],
					{
						color: line.color ?? '#eef3ff',
						weight: 3,
						opacity: 0.9,
						dashArray: '2 7',
						lineCap: 'round'
					}
				)
				.addTo(layer);
		}
		for (const m of currentMarkers) {
			const marker = lib
				.marker([m.lat, m.lng], {
					icon: iconFor(lib, m),
					keyboard: false,
					zIndexOffset: m.kind === 'answer' ? 1000 : m.highlight ? 500 : 0,
					interactive: !!m.label
				})
				.addTo(layer);
			if (m.label) marker.bindTooltip(m.label, { direction: 'top', offset: [0, -36] });
		}
		return () => {
			layer.remove();
		};
	});

	const fitKey = $derived(
		fitTo ? fitTo.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|') : ''
	);

	// Refit only when the set of points changes, so a player's own panning isn't reset.
	$effect(() => {
		if (!map || !L || !fitKey) return;
		const points = untrack(() => fitTo) ?? [];
		if (points.length === 0) return;
		if (points.length === 1) {
			map.setView(
				[points[0].lat, points[0].lng],
				Math.max(map.getZoom(), Math.min(maxFitZoom, 8)),
				{
					animate: false
				}
			);
			return;
		}
		const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
		map.fitBounds(bounds, { padding: [48, 48], maxZoom: maxFitZoom, animate: false });
	});

	/** Keyboard: Leaflet already pans with arrows and zooms with +/-; Enter drops the pin at the centre. */
	function onkeydown(e: KeyboardEvent) {
		if (!pickable || !map || (e.key !== 'Enter' && e.key !== ' ')) return;
		if (e.target !== e.currentTarget) return;
		e.preventDefault();
		const pos = map.getCenter().wrap();
		onpick?.({ lat: pos.lat, lng: pos.lng });
	}

	$effect(() => {
		if (!map || !focus) return;
		map.setView([focus.lat, focus.lng], focus.zoom ?? Math.max(map.getZoom(), 11), {
			animate: false
		});
	});
</script>

<div
	{@attach mountMap}
	class={cn(
		'glimt-map isolate h-full min-h-48 w-full overflow-hidden bg-sunken',
		pickable && 'glimt-map--pickable',
		className
	)}
	role="application"
	aria-label={pickable
		? `${label}. Flytt kartet med piltastene og trykk Enter for å sette nål i midten.`
		: label}
	{onkeydown}
	data-map-ready={map ? 'true' : 'false'}
	{...rest}
></div>

<style>
	.glimt-map :global(.leaflet-container) {
		font-family: var(--font-sans);
		background: var(--glimt-sunken);
	}
	/* Calm the OSM palette a little so pins and the orange answer stand out. */
	.glimt-map :global(.leaflet-tile-pane) {
		filter: saturate(0.6) contrast(0.95) brightness(1.02);
	}
	.glimt-map--pickable :global(.leaflet-grab) {
		cursor: crosshair;
	}
	.glimt-map :global(.glimt-pin) {
		background: none;
		border: none;
		filter: drop-shadow(0 3px 3px rgb(0 0 0 / 0.35));
	}
	.glimt-map :global(.glimt-pin--draft svg) {
		animation: glimt-drop 260ms cubic-bezier(0.2, 1.4, 0.4, 1);
		transform-origin: 50% 100%;
	}
	.glimt-map :global(.glimt-pin--answer svg) {
		animation: glimt-drop 600ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
		transform-origin: 50% 100%;
	}
	.glimt-map :global(.leaflet-control-zoom a) {
		background: var(--glimt-surface);
		color: var(--glimt-fg);
		border-color: var(--glimt-line);
	}
	.glimt-map :global(.leaflet-control-attribution) {
		background: rgb(15 42 110 / 0.75);
		color: var(--glimt-muted);
		font-size: 10px;
	}
	.glimt-map :global(.leaflet-control-attribution a) {
		color: var(--glimt-fg);
	}
	@keyframes -global-glimt-drop {
		from {
			transform: translateY(-14px) scale(0.7);
			opacity: 0;
		}
		to {
			transform: translateY(0) scale(1);
			opacity: 1;
		}
	}
</style>
