<script lang="ts">
	import Play from '@lucide/svelte/icons/play';
	import { Button, PlayerChip } from '$lib/ui';
	import JoinQr from '../JoinQr.svelte';
	import type { HostState } from '../types';

	let {
		data,
		colors,
		starting,
		onstart
	}: {
		data: HostState;
		colors: Map<string, string>;
		starting: boolean;
		onstart: () => void;
	} = $props();

	const origin = $derived(typeof location !== 'undefined' ? location.origin : '');
	const joinUrl = $derived(`${origin}/join?code=${data.session.code}`);
	const host = $derived(origin.replace(/^https?:\/\//, ''));
	const joinOrder = $derived([...data.standings].sort((a, b) => a.joinedAt - b.joinedAt));
</script>

<section
	class="grid flex-1 grid-rows-[auto_1fr_auto] gap-10 px-10 pt-6 pb-10"
	data-testid="host-lobby"
>
	<div class="grid grid-cols-[1fr_auto] items-center gap-12">
		<div class="flex flex-col gap-5">
			<p class="text-2xl text-muted">
				Gå til <span class="font-bold text-fg">{host}</span> og skriv inn koden
			</p>
			<p
				class="text-[clamp(4rem,10vw,9rem)] leading-none font-black tracking-[0.12em] tabular"
				data-testid="join-code"
				aria-label="Spillkode {data.session.code.split('').join(' ')}"
			>
				{data.session.code}
			</p>
		</div>
		<div class="flex flex-col items-center gap-2">
			<JoinQr url={joinUrl} class="size-56" />
			<span class="text-sm text-muted">Eller skann med mobilen</span>
		</div>
	</div>

	<div class="flex flex-col gap-4">
		<h2 class="text-xl font-bold" data-testid="lobby-count">
			{#if data.playerCount === 0}
				Venter på spillere …
			{:else}
				{data.playerCount} {data.playerCount === 1 ? 'spiller' : 'spillere'} er med
			{/if}
		</h2>
		<ul class="flex flex-wrap content-start gap-3" data-testid="lobby-players">
			{#each joinOrder as s (s.playerId)}
				<li class="animate-pop-in">
					<PlayerChip
						name={s.name}
						color={colors.get(s.playerId) ?? '#fff'}
						inactive={!s.active}
						size="lg"
					/>
				</li>
			{/each}
		</ul>
	</div>

	<div class="flex items-center justify-between gap-6 border-t border-line pt-6">
		<p class="text-lg text-muted">
			{data.session.roundCount}
			{data.session.roundCount === 1 ? 'bilde' : 'bilder'}. Spillerne kan bli med underveis også.
		</p>
		<Button
			size="xl"
			onclick={onstart}
			loading={starting}
			disabled={data.playerCount === 0}
			data-testid="start-game"
		>
			<Play class="size-6" fill="currentColor" />
			Start spillet
		</Button>
	</div>
</section>
