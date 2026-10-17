<script lang="ts">
	import { DateStamp, cn } from '$lib/ui';
	import Leaderboard from '../Leaderboard.svelte';
	import RevealMap from '../RevealMap.svelte';
	import { formatDistance, formatPoints, formatYearDiff } from '../format';
	import type { PlayerState } from '../types';

	let { data, colors }: { data: PlayerState; colors: Map<string, string> } = $props();

	const round = $derived(data.round!);
	const answer = $derived(round.answer!);
	const mine = $derived(round.results?.find((r) => r.playerId === data.me?._id) ?? null);
	const isLast = $derived(data.session.currentRoundIndex >= data.session.roundCount - 1);
</script>

<section class="flex flex-1 flex-col gap-4 px-3 pb-6" data-testid="player-reveal">
	<div class="h-[34dvh] shrink-0 overflow-hidden rounded-md ring-1 ring-line">
		<RevealMap {answer} results={round.results ?? []} {colors} meId={data.me?._id} />
	</div>

	<div class="flex items-center justify-between gap-4 px-2">
		<div class="flex min-w-0 flex-col">
			<span class="text-sm text-muted">Fasit</span>
			<span class="truncate text-xl font-bold" data-testid="answer-label"
				>{answer.label ?? 'Se kartet'}</span
			>
		</div>
		<DateStamp value={answer.year} size="lg" animate label="Riktig år: {answer.year}" />
	</div>
	{#if answer.caption}
		<p class="px-2 text-muted">{answer.caption}</p>
	{/if}

	<div class="rounded-lg bg-surface p-4 ring-1 ring-line ring-inset" data-testid="my-round-result">
		{#if mine?.answered}
			<div class="flex items-baseline justify-between gap-3">
				<span class="text-lg font-semibold">Du fikk</span>
				<span class="text-4xl font-black tabular" data-testid="round-score" data-score={mine.total}
					>{formatPoints(mine.total)}</span
				>
			</div>
			<dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
				<div class="rounded-md bg-sunken p-3">
					<dt class="flex flex-col">
						<span class="font-semibold text-fg">Sted</span>
						<span class="text-muted">{formatDistance(mine.distanceKm ?? 0)} unna</span>
					</dt>
					<dd class="text-lg font-bold tabular" data-testid="location-score">
						{formatPoints(mine.locationScore)}
					</dd>
				</div>
				<div class="rounded-md bg-sunken p-3">
					<dt class="flex flex-col">
						<span class="font-semibold text-fg">År</span>
						<span class="text-muted">{formatYearDiff(mine.yearDiff ?? 0)}</span>
					</dt>
					<dd class="text-lg font-bold tabular" data-testid="year-score">
						{formatPoints(mine.yearScore)}
					</dd>
				</div>
			</dl>
		{:else}
			<p class="text-lg font-semibold" data-testid="round-score" data-score="0">
				Du rakk ikke å svare – 0 poeng denne runden.
			</p>
		{/if}
		<div class="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
			<span class="text-muted">
				Totalt
				<span
					class="font-bold text-fg tabular"
					data-testid="total-score"
					data-total={data.me?.totalScore}>{formatPoints(data.me?.totalScore ?? 0)}</span
				> poeng
			</span>
			<span
				class="rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-fg"
				data-testid="my-rank">{data.me?.rank}. plass</span
			>
		</div>
	</div>

	<Leaderboard standings={data.standings} {colors} meId={data.me?._id} limit={5} />

	<p class={cn('text-center text-sm text-subtle')}>
		{isLast
			? 'Siste runde! Verten viser resultatene snart.'
			: 'Venter på at verten starter neste runde …'}
	</p>
</section>
