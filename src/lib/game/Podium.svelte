<script lang="ts">
	import { cn, initials } from '$lib/ui';
	import { formatPoints } from './format';
	import type { Standing } from './types';

	/** Top three on a podium: 2nd – 1st – 3rd, with the winner raised. */
	let {
		standings,
		colors,
		meId = null,
		size = 'md',
		class: className
	}: {
		standings: Standing[];
		colors: Map<string, string>;
		meId?: string | null;
		size?: 'md' | 'lg';
		class?: string;
	} = $props();

	const slots = $derived(
		[standings[1], standings[0], standings[2]]
			.map((s, i) => (s ? { s, place: [2, 1, 3][i] } : null))
			.filter((x) => x !== null)
	);
	const heights = { 1: 'h-40', 2: 'h-28', 3: 'h-20' } as const;
	const heightsLg = { 1: 'h-64', 2: 'h-44', 3: 'h-32' } as const;
</script>

<div class={cn('flex items-end justify-center gap-3', className)} data-testid="podium">
	{#each slots as { s, place } (s.playerId)}
		<div
			class="flex w-1/3 max-w-56 animate-rise flex-col items-center gap-2"
			style:animation-delay="{(3 - place) * 220 + 200}ms"
		>
			<span
				class={cn(
					'grid place-items-center rounded-full font-black text-bg ring-4 ring-bg',
					size === 'lg' ? 'size-20 text-2xl' : 'size-14 text-lg'
				)}
				style:background-color={colors.get(s.playerId)}
				aria-hidden="true">{initials(s.name)}</span
			>
			<span
				class={cn(
					'max-w-full truncate text-center font-bold',
					size === 'lg' ? 'text-2xl' : 'text-base',
					s.playerId === meId && 'underline decoration-2 underline-offset-4'
				)}>{s.name}</span
			>
			<span class={cn('font-semibold text-muted tabular', size === 'lg' ? 'text-xl' : 'text-sm')}
				>{formatPoints(s.totalScore)}</span
			>
			<div
				class={cn(
					'flex w-full items-start justify-center rounded-t-md pt-3 font-black',
					size === 'lg' ? heightsLg[place as 1 | 2 | 3] : heights[place as 1 | 2 | 3],
					place === 1
						? 'bg-primary text-primary-fg'
						: 'bg-raised text-fg ring-1 ring-line ring-inset',
					size === 'lg' ? 'text-5xl' : 'text-3xl'
				)}
			>
				{place}
			</div>
		</div>
	{/each}
</div>
