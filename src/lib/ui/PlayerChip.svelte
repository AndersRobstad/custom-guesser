<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { cn } from './cn';
	import { initials } from './colors';

	let {
		name,
		color,
		answered = false,
		inactive = false,
		me = false,
		size = 'md',
		class: className
	}: {
		name: string;
		color: string;
		answered?: boolean;
		inactive?: boolean;
		me?: boolean;
		size?: 'md' | 'lg';
		class?: string;
	} = $props();
</script>

<span
	class={cn(
		'inline-flex items-center gap-2 rounded-full bg-raised py-1 pr-3.5 pl-1 font-semibold ring-1 ring-line ring-inset',
		size === 'lg' ? 'text-xl' : 'text-sm',
		inactive && 'opacity-50',
		me && 'ring-2 ring-fg',
		className
	)}
	data-testid="player-chip"
>
	<span
		class={cn(
			'grid shrink-0 place-items-center rounded-full font-black text-bg',
			size === 'lg' ? 'size-10 text-base' : 'size-7 text-[0.7rem]'
		)}
		style:background-color={color}
		aria-hidden="true"
	>
		{#if answered}<Check
				class={size === 'lg' ? 'size-5' : 'size-4'}
				strokeWidth={3.5}
			/>{:else}{initials(name)}{/if}
	</span>
	<span class="max-w-[14ch] truncate">{name}</span>
	{#if answered}<span class="sr-only">(har svart)</span>{/if}
	{#if inactive}<span class="sr-only">(frakoblet)</span>{/if}
</span>
