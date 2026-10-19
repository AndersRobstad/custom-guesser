<script lang="ts">
	import Maximize from '@lucide/svelte/icons/maximize-2';
	import Play from '@lucide/svelte/icons/play';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import VolumeX from '@lucide/svelte/icons/volume-x';
	import { untrack, type Snippet } from 'svelte';
	import { Print, cn } from '$lib/ui';
	import { soundPreference } from './sound.svelte';

	/**
	 * The round's photo or video in a print frame.
	 * - `autoplay` (TV): the clip starts right away and loops. It plays with sound
	 *   when the browser allows it (the host has clicked in the page by then, which
	 *   unlocks audio in most browsers); otherwise it plays muted and offers
	 *   "Slå på lyd". The speaker button's choice is remembered for later rounds.
	 * - `on-demand` (phones): only the poster frame until the player taps play. The
	 *   clip isn't downloaded before that (`preload="none"`), and `play()` runs inside
	 *   the tap itself, which is what iOS requires to allow sound.
	 * - `still`: always just the image.
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
		/** Show a fullscreen button (phones, images only). */
		onzoom?: () => void;
		stamp?: Snippet;
	} = $props();

	let video = $state<HTMLVideoElement | null>(null);
	/** Mirrors the element's `muted` so the speaker button stays in sync with the controls. */
	let muted = $state(true);
	/** The browser refused to start with sound (no recent click on the page). */
	let blocked = $state(false);
	/** On-demand: the player has tapped play. */
	let started = $state(false);

	const isVideo = $derived(media.mediaType === 'video' && !!media.videoUrl);

	/** TV: start playing as soon as the element exists, with sound if allowed. */
	function autoplay(el: HTMLVideoElement) {
		video = el;
		const wantSound = untrack(() => soundPreference.on);
		el.muted = !wantSound;
		el.play()
			.then(() => (blocked = false))
			.catch(() => {
				if (!wantSound) return;
				el.muted = true;
				blocked = true;
				return el.play().catch(() => {});
			})
			.finally(() => (muted = el.muted));
		const sync = () => (muted = el.muted);
		el.addEventListener('volumechange', sync);
		return () => el.removeEventListener('volumechange', sync);
	}

	/** A click is a user gesture, so unmuting here is always allowed. */
	function toggleSound() {
		if (!video) return;
		video.muted = !video.muted;
		if (video.paused) void video.play().catch(() => {});
		soundPreference.set(!video.muted);
		blocked = false;
		muted = video.muted;
	}

	/** Phones: must call play() synchronously inside the tap for sound on iOS. */
	function startOnDemand() {
		started = true;
		if (!video) return;
		video.muted = false;
		video.play().catch(() => {
			if (!video) return;
			video.muted = true;
			void video.play().catch(() => {});
		});
	}
</script>

<div class={cn('relative', className)} data-testid="round-media" data-media-type={media.mediaType}>
	{#if isVideo && mode === 'autoplay'}
		<Print class="h-full" {stamp}>
			<!-- Host-uploaded party clips: there are no captions to offer. -->
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				{@attach autoplay}
				src={media.videoUrl}
				poster={media.imageUrl ?? undefined}
				class="h-full w-full object-contain"
				loop
				playsinline
				aria-label={alt}
			></video>
		</Print>
		<button
			type="button"
			onclick={toggleSound}
			aria-pressed={!muted}
			class={cn(
				'absolute bottom-5 left-5 flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-lg ring-1 backdrop-blur-sm',
				muted && blocked
					? 'bg-primary text-primary-fg ring-black/10'
					: 'bg-bg/80 text-fg ring-line-strong hover:bg-bg'
			)}
			data-testid="video-sound"
		>
			{#if muted}
				<VolumeX class="size-5" aria-hidden="true" /> Slå på lyd
			{:else}
				<Volume2 class="size-5" aria-hidden="true" /> Lyd på
			{/if}
		</button>
	{:else if isVideo && mode === 'on-demand'}
		<Print class="h-full" {stamp}>
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={video}
				src={media.videoUrl}
				poster={media.imageUrl ?? undefined}
				preload="none"
				class="h-full w-full object-contain"
				loop
				playsinline
				controls={started}
				aria-label={alt}
			></video>
		</Print>
		{#if !started}
			<button
				type="button"
				onclick={startOnDemand}
				class="absolute inset-0 m-auto flex h-12 w-fit items-center gap-2 rounded-full bg-bg/85 px-5 font-semibold text-fg shadow-lg ring-1 ring-line-strong backdrop-blur-sm hover:bg-bg"
				data-testid="play-video"
			>
				<Play class="size-5" fill="currentColor" /> Spill av video
			</button>
		{/if}
	{:else}
		<Print src={media.imageUrl} {alt} class="h-full" onclick={onzoom} {stamp} />
		{#if onzoom}
			<span
				class="pointer-events-none absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-bg/70 text-fg"
				aria-hidden="true"><Maximize class="size-4" /></span
			>
		{/if}
	{/if}
</div>
