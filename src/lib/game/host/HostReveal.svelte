<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/chevron-right';
	import Trophy from '@lucide/svelte/icons/trophy';
	import { Button, DateStamp, Print, initials } from '$lib/ui';
	import Leaderboard from '../Leaderboard.svelte';
	import RevealMap from '../RevealMap.svelte';
	import { formatDistance, formatPoints } from '../format';
	import type { HostState } from '../types';

	let {
		data,
		colors,
		advancing,
		onnext
	}: {
		data: HostState;
		colors: Map<string, string>;
		advancing: boolean;
		onnext: () => void;
	} = $props();

	const round = $derived(data.round!);
	const answer = $derived(round.answer!);
	const results = $derived(round.results ?? []);
</script>

<section
	class="grid min-h-0 flex-1 grid-cols-[1fr_30rem] gap-8 px-8 pb-8"
	data-testid="host-reveal"
>
	<div class="min-h-0 overflow-hidden rounded-lg ring-1 ring-line">
		<RevealMap {answer} {results} {colors} />
	</div>

	<aside class="flex min-h-0 flex-col gap-5">
		<div class="grid grid-cols-[10rem_1fr] items-center gap-5">
			<Print src={round.imageUrl} alt="Bilde {round.index + 1}" class="aspect-[4/3] rotate-[-2deg]">
				{#snippet stamp()}
					<DateStamp value={`'${String(answer.year).slice(2)}`} size="sm" animate label="" />
				{/snippet}
			</Print>
			<div class="flex min-w-0 flex-col gap-1">
				<DateStamp value={answer.year} size="xl" animate label="Riktig år: {answer.year}" />
				<p class="truncate text-2xl font-bold" data-testid="answer-label">
					{answer.label ?? 'Se kartet'}
				</p>
			</div>
		</div>
		{#if answer.caption}
			<p class="text-lg text-muted">{answer.caption}</p>
		{/if}

		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
			<table class="w-full text-left text-base" data-testid="round-results">
				<caption class="pb-2 text-left text-sm font-semibold text-muted">Denne runden</caption>
				<thead class="sr-only">
					<tr><th>Spiller</th><th>Avstand</th><th>År</th><th>Poeng</th></tr>
				</thead>
				<tbody>
					{#each results as r (r.playerId)}
						<tr
							class="border-b border-line last:border-0"
							data-player-name={r.name}
							data-score={r.total}
						>
							<td class="py-1.5">
								<span class="flex items-center gap-2 font-semibold">
									<span
										class="grid size-6 shrink-0 place-items-center rounded-full text-[0.6rem] font-black text-bg"
										style:background-color={colors.get(r.playerId)}
										aria-hidden="true">{initials(r.name)}</span
									>
									<span class="truncate">{r.name}</span>
								</span>
							</td>
							{#if r.answered}
								<td class="py-1.5 text-muted tabular">{formatDistance(r.distanceKm ?? 0)}</td>
								<td class="py-1.5 text-muted tabular">{r.year}</td>
							{:else}
								<td class="py-1.5 text-subtle" colspan="2">Svarte ikke</td>
							{/if}
							<td class="py-1.5 text-right font-bold tabular">{formatPoints(r.total)}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-semibold text-muted">Stillingen</h2>
				<Leaderboard standings={data.standings} {colors} limit={8} />
			</div>
		</div>

		<Button size="xl" block onclick={onnext} loading={advancing} data-testid="next-round">
			{#if data.isLastRound}
				<Trophy class="size-6" /> Vis resultatene
			{:else}
				Neste bilde <ArrowRight class="size-6" />
			{/if}
		</Button>
	</aside>
</section>
