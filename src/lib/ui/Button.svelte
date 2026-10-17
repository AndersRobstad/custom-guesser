<script lang="ts">
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import Spinner from './Spinner.svelte';
	import { cn } from './cn';
	import { buttonVariants, type ButtonVariants } from './variants';

	type Props = ButtonVariants & {
		loading?: boolean;
		href?: string;
		class?: string;
	} & Omit<HTMLButtonAttributes, 'class'> &
		Omit<HTMLAnchorAttributes, 'class' | keyof HTMLButtonAttributes>;

	let {
		variant,
		size,
		block,
		loading = false,
		href,
		class: className,
		disabled,
		type = 'button',
		children,
		...rest
	}: Props = $props();

	const classes = $derived(cn(buttonVariants({ variant, size, block }), className));
</script>

{#if href}
	<a {href} class={classes} {...rest as HTMLAnchorAttributes}>{@render children?.()}</a>
{:else}
	<button
		{type}
		class={classes}
		disabled={disabled || loading}
		aria-busy={loading || undefined}
		{...rest as HTMLButtonAttributes}
	>
		{#if loading}
			<Spinner class="absolute" />
			<span class="invisible contents">{@render children?.()}</span>
		{:else}
			{@render children?.()}
		{/if}
	</button>
{/if}
