<script lang="ts">
	import Maximize from '@lucide/svelte/icons/maximize-2';
	import Play from '@lucide/svelte/icons/play';
	import type { Snippet } from 'svelte';
	import { Print, cn } from '$lib/ui';

	/**
	 * The round's photo or video in a print frame.
	 * - `autoplay` (TV): videos play muted and looping straight away.
	 * - `on-demand` (phones): show the poster frame; the clip is only downloaded
	 *   when the player taps play, to spare mobile data and Convex bandwidth.
	 */
	let {
		media,
		mode,
		alt,
		class: className,
		onzoom,
		stamp
	}: {
		media: { mediaType: 'image' | 'video'; imageUrl: string | null; videoUrl: string | null };
		mode: 'autoplay' | 'on-demand' | 'still';
		alt: string;
		class?: string;
		/** Show a fullscreen button (phones). */
		onzoom?: () => void;
		stamp?: Snippet;
	} = $props();

	let playing = $state(false);
	const isVideo = $derived(media.mediaType === 'video' && !!media.videoUrl);
	const showVideo = $derived(isVideo && (mode === 'autoplay' || (mode === 'on-demand' && playing)));
</script>

<div class={cn('relative', className)} data-testid="round-media" data-media-type={media.mediaType}>
	{#if showVideo}
		<Print class="h-full" {stamp}>
			<video
				src={media.videoUrl}
				poster={media.imageUrl ?? undefined}
				class="h-full w-full object-contain"
				autoplay
				muted
				loop
				playsinline
				controls={mode === 'on-demand'}
				aria-label={alt}
			></video>
		</Print>
	{:else}
		<Print src={media.imageUrl} {alt} class="h-full" onclick={onzoom} {stamp} />
		{#if isVideo && mode === 'on-demand'}
			<button
				type="button"
				onclick={() => (playing = true)}
				class="absolute inset-0 m-auto flex h-12 w-fit items-center gap-2 rounded-full bg-bg/85 px-5 font-semibold text-fg shadow-lg ring-1 ring-line-strong backdrop-blur-sm hover:bg-bg"
				data-testid="play-video"
			>
				<Play class="size-5" fill="currentColor" /> Spill av video
			</button>
		{/if}
	{/if}
	{#if onzoom && !showVideo}
		<span
			class="pointer-events-none absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-bg/70 text-fg"
			aria-hidden="true"><Maximize class="size-4" /></span
		>
	{/if}
</div>
