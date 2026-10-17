<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import { clock } from '$lib/client/clock.svelte';
	import { Button, Countdown, PlayerChip } from '$lib/ui';
	import RoundMedia from '../RoundMedia.svelte';
	import type { HostState } from '../types';

	let {
		data,
		colors,
		revealing,
		onreveal
	}: {
		data: HostState;
		colors: Map<string, string>;
		revealing: boolean;
		onreveal: () => void;
	} = $props();

	const round = $derived(data.round!);
	const joinOrder = $derived([...data.standings].sort((a, b) => a.joinedAt - b.joinedAt));
	const timeUp = $derived(
		data.session.roundEndsAt !== null && clock.now >= data.session.roundEndsAt
	);
</script>

<section class="grid min-h-0 flex-1 grid-cols-[1fr_22rem] gap-8 px-8 pb-8" data-testid="host-round">
	<div class="min-h-0">
		{#key round.index}
			<RoundMedia
				media={round}
				mode="autoplay"
				alt="Bilde {round.index + 1}"
				class="h-full animate-rise"
			/>
		{/key}
	</div>

	<aside class="flex min-h-0 flex-col gap-6">
		<div class="flex flex-col gap-1">
			<span class="text-lg text-muted">Runde</span>
			<span class="text-5xl font-black tabular">
				{round.index + 1}<span class="text-muted">/{data.session.roundCount}</span>
			</span>
		</div>

		{#if data.session.roundEndsAt && data.session.roundStartedAt}
			<Countdown
				endsAt={data.session.roundEndsAt}
				startedAt={data.session.roundStartedAt}
				now={clock.now}
				size="xl"
				class="items-start"
			/>
		{:else}
			<p class="text-lg text-muted">Ingen tidsgrense denne runden.</p>
		{/if}

		<div class="flex min-h-0 flex-1 flex-col gap-3">
			<p class="text-2xl font-bold" data-testid="answered-count">
				{data.answeredCount} av {data.playerCount} har svart
			</p>
			<ul class="flex min-h-0 flex-wrap content-start gap-2 overflow-y-auto">
				{#each joinOrder as s (s.playerId)}
					<li>
						<PlayerChip
							name={s.name}
							color={colors.get(s.playerId) ?? '#fff'}
							answered={s.answered}
							inactive={!s.active && !s.answered}
						/>
					</li>
				{/each}
			</ul>
		</div>

		<Button
			size="lg"
			variant={timeUp ? 'primary' : 'secondary'}
			block
			onclick={onreveal}
			loading={revealing}
			data-testid="reveal-now"
		>
			<Eye class="size-5" />
			Avslør nå
		</Button>
	</aside>
</section>
