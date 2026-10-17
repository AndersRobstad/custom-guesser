<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const panelVariants = tv({
		base: 'text-fg',
		variants: {
			tone: {
				surface: 'bg-surface ring-1 ring-line ring-inset',
				raised: 'bg-raised ring-1 ring-line ring-inset',
				sunken: 'bg-sunken',
				outline: 'ring-1 ring-line-strong ring-inset'
			},
			padding: { none: '', sm: 'p-3', md: 'p-5', lg: 'p-7' },
			radius: { md: 'rounded-md', lg: 'rounded-lg' }
		},
		defaultVariants: { tone: 'surface', padding: 'md', radius: 'lg' }
	});

	export type PanelVariants = VariantProps<typeof panelVariants>;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './cn';

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
