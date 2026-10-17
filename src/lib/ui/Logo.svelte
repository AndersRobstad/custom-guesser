<script lang="ts">
	import { cn } from './cn';

	/** Glimt mark: a map pin (where) whose head is a camera lens with a date-stamp dot (when). */
	let {
		size = 'md',
		wordmark = true,
		class: className
	}: { size?: 'sm' | 'md' | 'lg' | 'xl'; wordmark?: boolean; class?: string } = $props();

	const heights = { sm: 'h-6', md: 'h-8', lg: 'h-12', xl: 'h-20' };
	const text = { sm: 'text-xl', md: 'text-2xl', lg: 'text-4xl', xl: 'text-6xl' };
</script>

<span class={cn('inline-flex items-center gap-2 text-fg', className)}>
	<svg viewBox="0 0 32 40" class={cn(heights[size], 'w-auto shrink-0')} aria-hidden="true">
		<path d="M16 39.2S3 24.8 3 15.2a13 13 0 0 1 26 0c0 9.6-13 24-13 24Z" fill="currentColor" />
		<circle cx="16" cy="15.2" r="7.6" fill="var(--glimt-bg)" />
		<circle cx="16" cy="15.2" r="7.6" fill="none" stroke="var(--glimt-bg)" stroke-width="1" />
		<circle cx="16" cy="15.2" r="3.9" fill="var(--glimt-stamp)" />
		<circle cx="14.6" cy="13.8" r="1.1" fill="#fff" opacity="0.85" />
	</svg>
	{#if wordmark}
		<span class={cn(text[size], 'leading-none font-black tracking-[-0.05em]')}>glimt</span>
	{/if}
</span>
