<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './cn';
	import { panelVariants, type PanelVariants } from './variants';

	let {
		tone,
		padding,
		radius,
		as = 'div',
		class: className,
		children,
		...rest
	}: PanelVariants &
		Omit<HTMLAttributes<HTMLElement>, 'class'> & {
			as?: 'div' | 'section' | 'aside' | 'article' | 'li';
			class?: string;
			children?: Snippet;
		} = $props();
</script>

<svelte:element this={as} class={cn(panelVariants({ tone, padding, radius }), className)} {...rest}>
	{@render children?.()}
</svelte:element>
