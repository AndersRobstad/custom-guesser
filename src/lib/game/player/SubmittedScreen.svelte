<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { DateStamp, Print } from '$lib/ui';
	import type { PlayerState } from '../types';

	let { data }: { data: PlayerState } = $props();
	const guess = $derived(data.round!.myGuess!);
</script>

<section
	class="flex flex-1 flex-col items-center gap-8 px-5 py-8 text-center"
	data-testid="guess-submitted"
>
	<div class="relative w-48 rotate-2">
		<Print src={data.round!.imageUrl} alt="Bildet du svarte på" class="aspect-[4/3]">
			{#snippet stamp()}
				<DateStamp value={guess.year} size="sm" label="Ditt år: {guess.year}" />
			{/snippet}
		</Print>
		<span
			class="absolute -top-4 -right-4 grid size-12 animate-pop-in place-items-center rounded-full bg-success text-bg shadow-lg"
			aria-hidden="true"><Check class="size-7" strokeWidth={3.5} /></span
		>
	</div>

	<div class="flex flex-col gap-2">
		<h1 class="text-3xl font-black tracking-tight">Svar sendt</h1>
		<p class="text-lg text-muted">
			Du gjettet <span class="font-semibold text-fg">{guess.year}</span>. Venter på de andre …
		</p>
	</div>

	<p class="text-sm font-semibold text-muted" data-testid="answered-count">
		{data.answeredCount} av {data.playerCount} har svart
	</p>
</section>
