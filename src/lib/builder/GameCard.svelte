<script lang="ts">
	import { resolve } from '$app/paths';
	import ImageIcon from '@lucide/svelte/icons/image';
	import Trash from '@lucide/svelte/icons/trash';
	import { Button, Print, cn } from '$lib/ui';
	import { countLabel, timesPlayedLabel } from './format';
	import type { GameListItem } from './types';

	/** One of the host's games on "Mine spill", shown as a loose paper print. */
	let {
		game,
		index,
		ondelete
	}: {
		game: GameListItem;
		index: number;
		ondelete: () => void;
	} = $props();

	// Prints lie slightly askew, like photos spread on a table.
	const TILTS = ['-rotate-[1.2deg]', 'rotate-[0.8deg]', '-rotate-[0.4deg]', 'rotate-[1.4deg]'];
	const tilt = $derived(TILTS[index % TILTS.length]);
	const status = $derived(
		game.activeSession?.status === 'lobby' ? 'Venter på spillere' : 'Spill pågår'
	);
</script>

<li class="group flex flex-col gap-4" data-testid="game-card">
	<a
		href={resolve('/create/[gameId]', { gameId: game._id })}
		tabindex="-1"
		aria-hidden="true"
		class="block"
	>
		{#if game.coverUrl}
			<Print
				src={game.coverUrl}
				alt=""
				fit="cover"
				class={cn(
					'aspect-[4/3] w-full transition-transform duration-300 group-hover:rotate-0 motion-reduce:transition-none',
					tilt
				)}
			/>
		{:else}
			<div
				class={cn(
					'grid aspect-[4/3] w-full place-items-center rounded-print border-2 border-dashed border-line-strong text-muted transition-transform duration-300 group-hover:rotate-0',
					tilt
				)}
			>
				<span class="flex flex-col items-center gap-2 text-sm">
					<ImageIcon class="size-8" aria-hidden="true" />
					Ingen bilder ennå
				</span>
			</div>
		{/if}
	</a>

	<div class="flex items-start justify-between gap-3">
		<div class="flex min-w-0 flex-col gap-1">
			<h2 class="text-lg leading-tight font-bold tracking-tight">
				<a
					href={resolve('/create/[gameId]', { gameId: game._id })}
					class="rounded-sm hover:underline"
					data-testid="game-link">{game.title}</a
				>
			</h2>
			<p class="text-sm text-muted">
				{countLabel(game.roundCount, 'bilde', 'bilder')} · {timesPlayedLabel(game.timesPlayed)}
			</p>
		</div>
		<Button
			variant="ghost"
			size="icon-sm"
			class="shrink-0 text-muted hover:text-danger"
			aria-label="Slett «{game.title}»"
			title="Slett spill"
			data-testid="delete-game"
			onclick={ondelete}
		>
			<Trash class="size-4" aria-hidden="true" />
		</Button>
	</div>

	{#if game.activeSession}
		<div class="flex flex-wrap items-center gap-3">
			<Button
				size="sm"
				variant="secondary"
				href={resolve('/host/[sessionId]', { sessionId: game.activeSession._id })}
			>
				Fortsett økt
			</Button>
			<span class="flex items-center gap-1.5 text-sm text-muted">
				<span class="size-2 rounded-full bg-success" aria-hidden="true"></span>
				{status} · kode
				<span class="font-bold tracking-widest text-fg">{game.activeSession.code}</span>
			</span>
		</div>
	{/if}
</li>
