<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from './cn';

	/**
	 * A photo framed like a paper print. `stamp` renders in the corner like a
	 * camera date imprint (used when the year is revealed). Pass `children` to
	 * frame something other than an image (e.g. a video).
	 */
	let {
		src = null,
		alt = '',
		fit = 'contain',
		class: className,
		imgClass,
		stamp,
		onclick,
		children
	}: {
		src?: string | null;
		alt?: string;
		fit?: 'contain' | 'cover';
		class?: string;
		imgClass?: string;
		stamp?: Snippet;
		onclick?: () => void;
		children?: Snippet;
	} = $props();

	const imgClasses = $derived(
		cn('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain', imgClass)
	);
</script>

<figure
	class={cn(
		'relative overflow-hidden rounded-print bg-fg p-1.5 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)] sm:p-2',
		className
	)}
>
	<div class="relative h-full w-full overflow-hidden bg-sunken">
		{#if children}
			{@render children()}
		{:else if src && onclick}
			<button
				type="button"
				class="block h-full w-full cursor-zoom-in"
				{onclick}
				aria-label="Vis bildet i fullskjerm"
			>
				<img {src} {alt} class={imgClasses} draggable="false" />
			</button>
		{:else if src}
			<img {src} {alt} class={imgClasses} draggable="false" />
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
