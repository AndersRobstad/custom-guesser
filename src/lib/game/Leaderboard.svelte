<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import { cn, initials } from '$lib/ui';
	import { formatPoints } from './format';
	import type { Standing } from './types';

	let {
		standings,
		colors,
		meId = null,
		limit,
		size = 'md',
		class: className
	}: {
		standings: Standing[];
		colors: Map<string, string>;
		meId?: string | null;
		limit?: number;
		size?: 'md' | 'lg';
		class?: string;
	} = $props();

	const shown = $derived.by(() => {
		if (!limit || standings.length <= limit) return standings;
		const top = standings.slice(0, limit);
		const me = standings.find((s) => s.playerId === meId);
		return me && !top.includes(me) ? [...top.slice(0, limit - 1), me] : top;
	});
</script>

<ol class={cn('flex flex-col gap-1.5', className)} data-testid="leaderboard">
	{#each shown as s (s.playerId)}
		{@const moved = s.previousRank !== null ? s.previousRank - s.rank : 0}
		<li
			class={cn(
				'grid grid-cols-[2.25rem_auto_1fr_auto] items-center gap-3 rounded-md bg-raised/70 px-3 ring-1 ring-line ring-inset',
				size === 'lg' ? 'py-2.5 text-xl' : 'py-2 text-base',
				s.playerId === meId && 'bg-primary text-primary-fg ring-0'
			)}
			data-testid="standing-row"
			data-player-name={s.name}
			data-total={s.totalScore}
		>
			<span class="text-right font-black tabular">{s.rank}.</span>
			<span
				class={cn(
					'grid place-items-center rounded-full font-black text-bg',
					size === 'lg' ? 'size-9 text-sm' : 'size-7 text-[0.65rem]'
				)}
				style:background-color={colors.get(s.playerId)}
				aria-hidden="true">{initials(s.name)}</span
			>
			<span class="flex min-w-0 items-center gap-2">
				<span class="truncate font-semibold">{s.name}</span>
				{#if moved > 0}
					<span class="flex items-center text-sm font-bold text-success" title="Opp {moved}">
						<ArrowUp class="size-4" strokeWidth={3} /><span class="sr-only">Opp</span>{moved}
					</span>
				{:else if moved < 0}
					<span class="flex items-center text-sm font-bold text-danger" title="Ned {-moved}">
						<ArrowDown class="size-4" strokeWidth={3} /><span class="sr-only">Ned</span>{-moved}
					</span>
				{/if}
			</span>
			<span class="flex items-baseline gap-2 font-bold tabular">
				{#if s.roundScore !== null && s.roundScore > 0}
					<span
						class={cn(
							'text-sm font-semibold',
							s.playerId === meId ? 'text-primary-fg/70' : 'text-success'
						)}>+{formatPoints(s.roundScore)}</span
					>
				{/if}
				<span data-testid="standing-total">{formatPoints(s.totalScore)}</span>
			</span>
		</li>
	{/each}
</ol>
