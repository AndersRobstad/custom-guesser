<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Logo, cn } from '$lib/ui';

	let { class: className, children }: { class?: string; children?: Snippet } = $props();
</script>

<header
	class={cn(
		'flex items-center justify-between gap-4 px-4 py-3 [padding-top:max(0.75rem,env(safe-area-inset-top))] sm:px-6',
		className
	)}
>
	<a href="/" class="rounded-sm" aria-label="Glimt – til forsiden"><Logo size="sm" /></a>
	{#if children}
		<div class="flex min-w-0 items-center gap-2">{@render children()}</div>
	{/if}
</header>
