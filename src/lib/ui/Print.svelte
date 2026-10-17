<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from './cn';

	/**
	 * A photo framed like a paper print. `stamp` renders in the corner like a
	 * camera date imprint (used when the year is revealed).
	 */
	let {
		src,
		alt,
		fit = 'contain',
		class: className,
		imgClass,
		stamp,
		onclick
	}: {
		src: string | null;
		alt: string;
		fit?: 'contain' | 'cover';
		class?: string;
		imgClass?: string;
		stamp?: Snippet;
		onclick?: () => void;
	} = $props();
</script>

<figure
	class={cn(
		'relative overflow-hidden rounded-print bg-fg p-1.5 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)] sm:p-2',
		className
	)}
>
	<div class="relative h-full w-full overflow-hidden bg-sunken">
		{#if src}
			{#if onclick}
				<button
					type="button"
					class="block h-full w-full cursor-zoom-in"
					{onclick}
					aria-label="Vis bildet i fullskjerm"
				>
					<img
						{src}
						{alt}
						class={cn(
							'h-full w-full',
							fit === 'cover' ? 'object-cover' : 'object-contain',
							imgClass
						)}
						draggable="false"
					/>
				</button>
			{:else}
				<img
					{src}
					{alt}
					class={cn('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain', imgClass)}
					draggable="false"
				/>
			{/if}
		{:else}
			<div class="grid h-full min-h-40 w-full place-items-center text-sm text-muted">
				Bildet lastes …
			</div>
		{/if}
		{#if stamp}
			<div class="pointer-events-none absolute right-3 bottom-2 sm:right-5 sm:bottom-4">
				{@render stamp()}
			</div>
		{/if}
	</div>
</figure>
