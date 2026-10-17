<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { normalizeCode } from '$lib/game';
	import { clock } from '$lib/client/clock.svelte';
	import { startHeartbeat } from '$lib/client/heartbeat';
	import { getClientId } from '$lib/client/identity';
	import GuessScreen from '$lib/game/player/GuessScreen.svelte';
	import PlayerFinal from '$lib/game/player/PlayerFinal.svelte';
	import PlayerLobby from '$lib/game/player/PlayerLobby.svelte';
	import PlayerReveal from '$lib/game/player/PlayerReveal.svelte';
	import SubmittedScreen from '$lib/game/player/SubmittedScreen.svelte';
	import { Button, Countdown, Panel, Spinner, playerColors } from '$lib/ui';

	const client = useConvexClient();
	const clientId = getClientId();
	const code = $derived(normalizeCode(page.params.code ?? ''));

	const query = useQuery(api.players.state, () => ({ code, clientId }), { keepPreviousData: true });
	const data = $derived(query.data);
	const status = $derived(data?.session.status);
	const joined = $derived(!!data?.me);
	const sessionId = $derived(data?.session._id);
	const colors = $derived(playerColors(data?.standings ?? []));

	// Not a player in this game yet → go pick a name (unless it's already over).
	$effect(() => {
		if (data && !data.me && data.session.status !== 'finished') {
			goto(`/join?code=${data.session.code}`, { replaceState: true });
		}
	});

	// Presence + server clock sync while we're in the game.
	$effect(() => {
		if (!sessionId || !joined || status === 'finished') return;
		const id = sessionId;
		return startHeartbeat(() =>
			client.mutation(api.players.heartbeat, { sessionId: id, clientId })
		);
	});
</script>

<svelte:head>
	<title>{data ? `${data.session.title} – Glimt` : 'Glimt'}</title>
</svelte:head>

<div
	class="mx-auto flex h-dvh max-w-5xl flex-col overflow-y-auto"
	data-testid="play-page"
	data-status={status}
>
	<AppHeader class="shrink-0 py-2">
		{#if data?.me}
			{#if status === 'playing' || status === 'reveal'}
				<span class="text-sm font-semibold text-muted tabular" data-testid="round-indicator">
					Runde {data.session.currentRoundIndex + 1} av {data.session.roundCount}
				</span>
			{/if}
			{#if status === 'playing' && data.session.roundEndsAt && data.session.roundStartedAt}
				<Countdown
					endsAt={data.session.roundEndsAt}
					startedAt={data.session.roundStartedAt}
					now={clock.now}
					size="sm"
					class="w-16"
				/>
			{:else}
				<span
					class="max-w-[9rem] truncate rounded-full bg-raised px-3 py-1 text-sm font-semibold"
					data-testid="me-name">{data.me.name}</span
				>
			{/if}
		{/if}
	</AppHeader>

	{#if query.isLoading && !data}
		<div class="grid flex-1 place-items-center"><Spinner class="size-8" /></div>
	{:else if query.error && !data}
		<main class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
			<p class="text-lg">Mistet kontakten med spillet. Prøver igjen …</p>
		</main>
	{:else if !data}
		<main class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
			<h1 class="text-3xl font-black">Fant ingen spill med koden {code}</h1>
			<p class="text-muted">Sjekk koden på storskjermen og prøv igjen.</p>
			<Button href="/">Til forsiden</Button>
		</main>
	{:else if !data.me}
		<main class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
			{#if status === 'finished'}
				<h1 class="text-3xl font-black">Dette spillet er ferdig</h1>
				<Button href="/">Bli med i et annet spill</Button>
			{:else}
				<Spinner class="size-8" />
			{/if}
		</main>
	{:else if status === 'lobby'}
		<PlayerLobby {data} {colors} />
	{:else if status === 'playing' && data.round}
		{#if data.round.myGuess}
			<SubmittedScreen {data} />
		{:else}
			{#key data.round.index}
				<GuessScreen {data} {clientId} />
			{/key}
		{/if}
	{:else if status === 'reveal' && data.round?.answer}
		<PlayerReveal {data} {colors} />
	{:else if status === 'finished'}
		<PlayerFinal {data} {colors} />
	{:else}
		<Panel class="m-4">Laster …</Panel>
	{/if}
</div>
