<script lang="ts">
	import Send from '@lucide/svelte/icons/send';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import { GUESS_GRACE_MS } from '$lib/game';
	import { clock } from '$lib/client/clock.svelte';
	import { errorMessage } from '$lib/client/errors';
	import MapView, { type LatLng } from '$lib/map/MapView.svelte';
	import { Button, Dialog, toast } from '$lib/ui';
	import RoundMedia from '../RoundMedia.svelte';
	import YearPicker from '../YearPicker.svelte';
	import type { PlayerState } from '../types';

	let {
		data,
		clientId
	}: {
		data: PlayerState;
		clientId: string;
	} = $props();

	const client = useConvexClient();
	const round = $derived(data.round!);

	let pin = $state<LatLng | null>(null);
	let year = $state<number | null>(null);
	let sending = $state(false);
	let zoomOpen = $state(false);

	const timeUp = $derived(
		data.session.roundEndsAt !== null && clock.now > data.session.roundEndsAt + GUESS_GRACE_MS
	);
	const ready = $derived(pin !== null && year !== null);
	const missing = $derived(
		!pin && year === null
			? 'Sett en nål på kartet og velg år'
			: !pin
				? 'Sett en nål på kartet'
				: year === null
					? 'Velg år'
					: null
	);

	async function submit() {
		if (!pin || year === null) return;
		sending = true;
		try {
			await client.mutation(api.players.submitGuess, {
				sessionId: data.session._id,
				clientId,
				roundIndex: round.index,
				lat: pin.lat,
				lng: pin.lng,
				year
			});
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			sending = false;
		}
	}
</script>

<section
	class="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:grid lg:grid-cols-2 lg:grid-rows-[1fr_auto] lg:gap-4 lg:px-6"
	data-testid="guess-screen"
>
	<RoundMedia
		media={round}
		mode="on-demand"
		alt="Bildet du skal gjette på"
		class="h-[28dvh] shrink-0 lg:row-span-2 lg:h-auto"
		onzoom={() => (zoomOpen = true)}
	/>

	<div class="relative min-h-44 flex-1 overflow-hidden rounded-md ring-1 ring-line">
		<MapView
			pickable={!sending}
			onpick={(p) => (pin = p)}
			markers={pin ? [{ id: 'me', kind: 'draft', ...pin }] : []}
			label="Kart – trykk for å sette nål"
			data-testid="guess-map"
			data-pin-lat={pin?.lat}
			data-pin-lng={pin?.lng}
		/>
		{#if !pin}
			<div
				class="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center"
				aria-hidden="true"
			>
				<span class="rounded-full bg-bg/85 px-3 py-1.5 text-sm font-semibold text-fg shadow">
					Trykk på kartet for å sette nål
				</span>
			</div>
		{/if}
	</div>

	<div class="flex shrink-0 flex-col gap-3 rounded-lg bg-surface p-3 ring-1 ring-line ring-inset">
		<YearPicker
			bind:value={year}
			min={data.session.yearMin}
			max={data.session.yearMax}
			disabled={sending}
		/>
		<Button
			size="lg"
			block
			disabled={!ready || timeUp}
			loading={sending}
			onclick={submit}
			data-testid="submit-guess"
		>
			<Send class="size-5" />
			{timeUp ? 'Tiden er ute' : 'Send svar'}
		</Button>
		{#if missing && !timeUp}
			<p class="-mt-1 text-center text-sm text-muted" aria-live="polite">{missing}</p>
		{/if}
	</div>
</section>

<Dialog bind:open={zoomOpen} title={round.mediaType === 'video' ? 'Videoen' : 'Bildet'} size="full">
	<RoundMedia
		media={round}
		mode="on-demand"
		alt="Bildet i fullskjerm"
		class="h-full min-h-[60dvh]"
	/>
</Dialog>
