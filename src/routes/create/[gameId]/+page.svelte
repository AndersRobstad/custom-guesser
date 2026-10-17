<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import { useQuery } from 'convex-svelte';
	import GameBuilder from '$lib/builder/GameBuilder.svelte';
	import { errorMessage } from '$lib/client/errors';
	import { getClientId } from '$lib/client/identity';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { Button, Spinner } from '$lib/ui';
	import { api } from '../../../convex/_generated/api';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const clientId = getClientId();
	const game = useQuery(api.games.get, () => ({ gameId: params.gameId, clientId }));
</script>

<svelte:head>
	<title>{game.data ? `${game.data.game.title} · Glimt` : 'Rediger spill · Glimt'}</title>
</svelte:head>

<AppHeader>
	<Button variant="ghost" size="sm" href={resolve('/create')}>
		<ChevronLeft class="size-4" aria-hidden="true" />
		Mine spill
	</Button>
</AppHeader>

{#if game.isLoading}
	<main class="grid min-h-[60dvh] place-items-center">
		<Spinner class="size-8 text-muted" label="Laster spillet" />
	</main>
{:else if game.error}
	<main class="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
		<h1 class="text-3xl font-black tracking-tight">Klarte ikke å hente spillet</h1>
		<p class="text-muted">{errorMessage(game.error)}</p>
		<Button href={resolve('/create')}>Til mine spill</Button>
	</main>
{:else if game.data === null}
	<main
		class="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center"
		data-testid="game-not-found"
	>
		<h1 class="text-3xl font-black tracking-tight">Fant ikke spillet</h1>
		<p class="text-muted">
			Det kan være slettet, eller laget i en annen nettleser. Spill er knyttet til nettleseren de
			ble laget i.
		</p>
		<Button href={resolve('/create')}>Til mine spill</Button>
	</main>
{:else}
	{#key params.gameId}
		<GameBuilder details={game.data} gameId={params.gameId} {clientId} />
	{/key}
{/if}
