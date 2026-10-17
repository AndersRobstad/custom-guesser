<script lang="ts">
	import DateStamp from './DateStamp.svelte';
	import { cn } from './cn';

	/**
	 * Visual-only countdown to a server deadline. `now` must already be
	 * corrected for clock skew (see `clock`). The last 10 seconds are marked.
	 */
	let {
		endsAt,
		startedAt,
		now,
		size = 'md',
		class: className
	}: {
		endsAt: number;
		startedAt: number;
		now: number;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		class?: string;
	} = $props();

	const total = $derived(Math.max(1, endsAt - startedAt));
	// Clamp so clock-skew correction can never show more time than the round has (e.g. 1:01 of 1:00).
	const remainingMs = $derived(Math.min(total, Math.max(0, endsAt - now)));
	const seconds = $derived(Math.ceil(remainingMs / 1000));
	const fraction = $derived(Math.min(1, remainingMs / total));
	const urgent = $derived(seconds <= 10);
	const display = $derived(
		seconds >= 60
			? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
			: String(seconds).padStart(2, '0')
	);
</script>

<div
	class={cn('flex flex-col items-end gap-2', className)}
	data-testid="countdown"
	data-urgent={urgent}
	role="timer"
	aria-live={urgent ? 'polite' : 'off'}
	aria-label={`${seconds} sekunder igjen`}
>
	{#key urgent ? seconds : 'calm'}
		<DateStamp value={display} {size} class={cn(urgent && seconds > 0 && 'animate-pop-in')} />
	{/key}
	<div class="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-sunken">
		<div
			class={cn(
				'h-full rounded-full transition-[width] duration-200 ease-linear',
				urgent ? 'bg-stamp' : 'bg-fg/70'
			)}
			style:width="{fraction * 100}%"
		></div>
	</div>
</div>
