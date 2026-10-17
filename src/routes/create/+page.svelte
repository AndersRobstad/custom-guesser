<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Plus from '@lucide/svelte/icons/plus';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import ConfirmDialog from '$lib/builder/ConfirmDialog.svelte';
	import GameCard from '$lib/builder/GameCard.svelte';
	import type { GameListItem } from '$lib/builder/types';
	import { errorMessage } from '$lib/client/errors';
	import { getClientId } from '$lib/client/identity';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { Button, toast } from '$lib/ui';
	import { api } from '../../convex/_generated/api';

	const clientId = getClientId();
	const client = useConvexClient();
	const games = useQuery(api.games.listMine, () => ({ clientId }));

	let creating = $state(false);

	async function createGame() {
		creating = true;
		try {
			const gameId = await client.mutation(api.games.create, { clientId });
			await goto(resolve('/create/[gameId]', { gameId }));
		} catch (error) {
			toast.error(errorMessage(error));
			creating = false;
		}
	}

	let deleting = $state.raw<GameListItem | null>(null);
	let deleteOpen = $state(false);
	let deleteBusy = $state(false);

	function askDelete(game: GameListItem) {
		deleting = game;
		deleteOpen = true;
	}

	async function confirmDelete() {
		const game = deleting;
		if (!game) return;
		deleteBusy = true;
		try {
			await client.mutation(
				api.games.remove,
				{ gameId: game._id, clientId },
				{
					optimisticUpdate: (store) => {
						const current = store.getQuery(api.games.listMine, { clientId });
						if (current)
							store.setQuery(
								api.games.listMine,
								{ clientId },
								current.filter((g) => g._id !== game._id)
							);
					}
				}
			);
			deleteOpen = false;
			toast.success('Spillet er slettet');
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			deleteBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Mine spill · Glimt</title>
</svelte:head>

<AppHeader>
	<Button variant="ghost" size="sm" href={resolve('/join')}>Bli med i et spill</Button>
</AppHeader>

<main class="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-6 pb-24 sm:px-6 sm:pt-10">
	<div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
		<div class="flex flex-col gap-2">
			<h1 class="text-4xl font-black tracking-tight sm:text-5xl">Mine spill</h1>
			<p class="text-muted">Spillene dine er lagret i denne nettleseren.</p>
		</div>
		<Button size="lg" loading={creating} data-testid="new-game" onclick={createGame}>
			<Plus class="size-5" aria-hidden="true" />
			Nytt spill
		</Button>
	</div>

	{#if games.isLoading}
		<ul class="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3" aria-label="Laster spill">
			{#each [0, 1, 2] as placeholder (placeholder)}
				<li class="flex animate-pulse flex-col gap-4">
					<div class="aspect-[4/3] w-full rounded-print bg-surface"></div>
					<div class="h-5 w-2/3 rounded-sm bg-surface"></div>
					<div class="h-4 w-1/3 rounded-sm bg-surface"></div>
				</li>
			{/each}
		</ul>
	{:else if games.error}
		<div class="flex flex-col items-start gap-3" role="alert">
			<p class="text-lg font-semibold">Klarte ikke å hente spillene dine.</p>
			<p class="text-muted">{errorMessage(games.error)}</p>
		</div>
	{:else if games.data.length === 0}
		<div
			class="flex flex-col items-start gap-6 border-t border-line pt-10 sm:flex-row sm:items-center sm:gap-12"
			data-testid="games-empty"
		>
			<div
				class="grid aspect-[4/3] w-full max-w-xs shrink-0 -rotate-2 place-items-center rounded-print bg-fg p-2 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)]"
				aria-hidden="true"
			>
				<div
					class="grid h-full w-full place-items-center bg-sunken text-5xl font-black text-subtle"
				>
					?
				</div>
			</div>
			<div class="flex max-w-lg flex-col items-start gap-4">
				<h2 class="text-2xl font-bold tracking-tight">Du har ingen spill ennå</h2>
				<p class="text-muted">
					Velg noen bilder, sett en nål på kartet og et årstall for hvert av dem. Så gjetter
					gjestene hvor og når bildene er tatt. Kall det gjerne noe som «Hvor og når er Anders».
				</p>
				<Button loading={creating} onclick={createGame}>
					<Plus class="size-5" aria-hidden="true" />
					Lag ditt første spill
				</Button>
			</div>
		</div>
	{:else}
		<ul class="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3" data-testid="game-list">
			{#each games.data as game, index (game._id)}
				<GameCard {game} {index} ondelete={() => askDelete(game)} />
			{/each}
		</ul>
	{/if}
</main>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Slett spill"
	description={deleting
		? `«${deleting.title}» og alle bildene i spillet slettes for godt.`
		: undefined}
	confirmLabel="Slett spill"
	busy={deleteBusy}
	onconfirm={confirmDelete}
/>
