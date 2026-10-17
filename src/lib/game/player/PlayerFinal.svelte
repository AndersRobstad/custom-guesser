<script lang="ts">
	import { Button } from '$lib/ui';
	import Leaderboard from '../Leaderboard.svelte';
	import Podium from '../Podium.svelte';
	import { formatPoints } from '../format';
	import type { PlayerState } from '../types';

	let { data, colors }: { data: PlayerState; colors: Map<string, string> } = $props();

	const rank = $derived(data.me?.rank ?? null);
	const headline = $derived(
		rank === 1
			? 'Du vant!'
			: rank === 2 || rank === 3
				? `Du kom på pallen som nr. ${rank}!`
				: rank
					? `Du kom på ${rank}. plass`
					: 'Spillet er ferdig'
	);
</script>

<section class="flex flex-1 flex-col gap-8 px-4 py-6" data-testid="player-final">
	<div class="flex flex-col gap-2 text-center">
		<p class="text-muted">«{data.session.title}» er ferdig</p>
		<h1 class="text-4xl font-black tracking-tight text-balance">{headline}</h1>
		{#if data.me}
			<p class="text-lg text-muted">
				<span class="font-bold text-fg tabular">{formatPoints(data.me.totalScore)}</span> poeng totalt
			</p>
		{/if}
	</div>

	<Podium standings={data.standings} {colors} meId={data.me?._id} />

	<div class="flex flex-col gap-3">
		<h2 class="text-sm font-semibold text-muted">Resultatliste</h2>
		<div data-testid="final-standings">
			<Leaderboard standings={data.standings} {colors} meId={data.me?._id} />
		</div>
	</div>

	<div class="mt-auto flex flex-col gap-2">
		<Button href="/" variant="secondary" block>Bli med i et nytt spill</Button>
		<Button href="/create" variant="ghost" block>Lag ditt eget spill</Button>
	</div>
</section>
