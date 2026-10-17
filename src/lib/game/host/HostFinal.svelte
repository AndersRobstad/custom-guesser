<script lang="ts">
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { Button } from '$lib/ui';
	import Leaderboard from '../Leaderboard.svelte';
	import Podium from '../Podium.svelte';
	import type { HostState } from '../types';

	let {
		data,
		colors,
		restarting,
		onrestart
	}: {
		data: HostState;
		colors: Map<string, string>;
		restarting: boolean;
		onrestart: () => void;
	} = $props();
</script>

<section
	class="grid min-h-0 flex-1 grid-cols-[1.2fr_1fr] gap-10 px-10 pb-10"
	data-testid="host-final"
>
	<div class="flex min-h-0 flex-col justify-end gap-8">
		<h1 class="text-6xl font-black tracking-tight">
			{data.standings[0] ? `${data.standings[0].name} vant!` : 'Spillet er ferdig'}
		</h1>
		<Podium standings={data.standings} {colors} size="lg" />
	</div>
	<div class="flex min-h-0 flex-col gap-4">
		<h2 class="text-sm font-semibold text-muted">Resultatliste</h2>
		<div class="min-h-0 flex-1 overflow-y-auto pr-1" data-testid="final-standings">
			<Leaderboard standings={data.standings} {colors} size="lg" />
		</div>
		<div class="flex gap-3">
			<Button size="lg" onclick={onrestart} loading={restarting} data-testid="play-again">
				<RotateCcw class="size-5" /> Spill igjen
			</Button>
			<Button size="lg" variant="secondary" href="/create">Til mine spill</Button>
		</div>
	</div>
</section>
