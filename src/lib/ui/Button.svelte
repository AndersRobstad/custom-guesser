<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: [
			'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold',
			'transition-[background-color,color,box-shadow,transform] duration-150 active:translate-y-px',
			'disabled:pointer-events-none disabled:opacity-45'
		],
		variants: {
			variant: {
				primary:
					'bg-primary text-primary-fg shadow-[0_3px_0_0_rgb(0_0_0/0.25)] hover:bg-primary-hover active:shadow-none',
				secondary: 'bg-raised text-fg ring-1 ring-line-strong ring-inset hover:bg-surface',
				ghost: 'text-fg hover:bg-raised',
				outline: 'text-fg ring-1 ring-line-strong ring-inset hover:bg-raised',
				danger: 'bg-danger text-bg hover:brightness-110'
			},
			size: {
				sm: 'h-9 rounded-sm px-3 text-sm',
				md: 'h-11 rounded-md px-5 text-base',
				lg: 'h-14 rounded-md px-7 text-lg',
				xl: 'h-16 rounded-lg px-9 text-xl',
				icon: 'size-11 rounded-md',
				'icon-sm': 'size-9 rounded-sm'
			},
			block: { true: 'w-full' }
		},
		defaultVariants: { variant: 'primary', size: 'md' }
	});

	export type ButtonVariants = VariantProps<typeof buttonVariants>;
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import Spinner from './Spinner.svelte';
	import { cn } from './cn';

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
