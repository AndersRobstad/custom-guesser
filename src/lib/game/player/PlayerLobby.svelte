<script lang="ts">
	import { PlayerChip } from '$lib/ui';
	import type { PlayerState } from '../types';

	let { data, colors }: { data: PlayerState; colors: Map<string, string> } = $props();
	const joinOrder = $derived([...data.standings].sort((a, b) => a.joinedAt - b.joinedAt));
</script>

<section class="flex flex-1 flex-col gap-8 px-5 py-8" data-testid="player-lobby">
	<div class="flex flex-col gap-3">
		<p class="text-lg text-muted">«{data.session.title}»</p>
		<h1 class="text-4xl leading-tight font-black tracking-tight text-balance">
			Du er med, {data.me?.name}!
		</h1>
		<p class="text-lg text-muted">
			Følg med på storskjermen. Spillet starter når verten trykker start.
		</p>
	</div>

	<div class="flex flex-col gap-3">
		<h2 class="text-sm font-semibold text-muted">
			{data.playerCount}
			{data.playerCount === 1 ? 'spiller' : 'spillere'} i lobbyen
		</h2>
		<ul class="flex flex-wrap gap-2">
			{#each joinOrder as s (s.playerId)}
				<li class="animate-pop-in">
					<PlayerChip
						name={s.name}
						color={colors.get(s.playerId) ?? '#fff'}
						me={s.playerId === data.me?._id}
					/>
				</li>
			{/each}
		</ul>
	</div>

	<div class="mt-auto flex items-center gap-3 text-sm text-subtle">
		<span class="relative flex size-2.5">
			<span
				class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60"
			></span>
			<span class="relative inline-flex size-2.5 rounded-full bg-success"></span>
		</span>
		Venter på verten …
	</div>
</section>
