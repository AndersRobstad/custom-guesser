<script lang="ts">
	import MapView, { type MapLine, type MapMarker } from '$lib/map/MapView.svelte';
	import { initials } from '$lib/ui';
	import type { RevealedAnswer, RoundResult } from './types';

	/** All guesses as pins with dotted lines to the orange answer pin. */
	let {
		answer,
		results,
		colors,
		meId = null,
		class: className
	}: {
		answer: RevealedAnswer;
		results: RoundResult[];
		colors: Map<string, string>;
		meId?: string | null;
		class?: string;
	} = $props();

	const answered = $derived(results.filter((r) => r.answered && r.lat !== null && r.lng !== null));

	const markers = $derived<MapMarker[]>([
		...answered.map((r) => ({
			id: r.playerId,
			kind: 'guess' as const,
			lat: r.lat!,
			lng: r.lng!,
			color: colors.get(r.playerId),
			text: initials(r.name),
			label: r.name,
			highlight: r.playerId === meId
		})),
		{
			id: 'answer',
			kind: 'answer',
			lat: answer.lat,
			lng: answer.lng,
			label: answer.label ?? 'Fasit'
		}
	]);

	const lines = $derived<MapLine[]>(
		answered.map((r) => ({
			from: { lat: r.lat!, lng: r.lng! },
			to: { lat: answer.lat, lng: answer.lng },
			color: colors.get(r.playerId)
		}))
	);

	const fitTo = $derived([{ lat: answer.lat, lng: answer.lng }, ...markers]);
</script>

<MapView
	{markers}
	{lines}
	{fitTo}
	center={{ lat: answer.lat, lng: answer.lng }}
	zoom={5}
	label="Kart med fasit og alle svar"
	class={className}
	data-testid="reveal-map"
/>
