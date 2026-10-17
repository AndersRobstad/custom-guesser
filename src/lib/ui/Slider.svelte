<script lang="ts">
	import { Slider } from 'bits-ui';
	import { cn } from './cn';

	let {
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		disabled = false,
		label,
		valueText,
		tone = 'default',
		class: className,
		onValueChange
	}: {
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		disabled?: boolean;
		/** Accessible name for the thumb. */
		label: string;
		/** Spoken value, e.g. "2004". */
		valueText?: string;
		tone?: 'default' | 'stamp';
		class?: string;
		onValueChange?: (value: number) => void;
	} = $props();
</script>

<Slider.Root
	type="single"
	bind:value
	{min}
	{max}
	{step}
	{disabled}
	{onValueChange}
	class={cn(
		'relative flex h-10 w-full touch-none items-center select-none data-disabled:opacity-50',
		className
	)}
>
	{#snippet children({ thumbItems })}
		<span class="relative h-2 w-full grow overflow-hidden rounded-full bg-sunken">
			<Slider.Range class={cn('absolute h-full', tone === 'stamp' ? 'bg-stamp' : 'bg-fg')} />
		</span>
		{#each thumbItems as thumb (thumb.index)}
			<Slider.Thumb
				index={thumb.index}
				aria-label={label}
				aria-valuetext={valueText}
				class={cn(
					'block size-7 rounded-full bg-primary shadow-[0_2px_0_0_rgb(0_0_0/0.3)] ring-4 transition-transform',
					'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-(--glimt-focus) active:scale-110',
					tone === 'stamp' ? 'ring-stamp' : 'ring-raised'
				)}
			/>
		{/each}
	{/snippet}
</Slider.Root>
