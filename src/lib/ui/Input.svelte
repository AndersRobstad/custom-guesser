<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	export const inputVariants = tv({
		base: [
			'w-full bg-sunken text-fg ring-1 ring-line-strong ring-inset placeholder:text-subtle',
			'transition-shadow focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-fg',
			'disabled:opacity-50 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger'
		],
		variants: {
			size: {
				md: 'h-11 rounded-md px-3.5 text-base',
				lg: 'h-14 rounded-md px-4 text-lg'
			}
		},
		defaultVariants: { size: 'md' }
	});
</script>

<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from './cn';

	type Props = Omit<HTMLInputAttributes, 'size' | 'class'> & {
		size?: 'md' | 'lg';
		class?: string;
		value?: string | number | null;
		ref?: HTMLInputElement | null;
	};

	let {
		size,
		class: className,
		value = $bindable(),
		ref = $bindable(null),
		...rest
	}: Props = $props();
</script>

<input bind:this={ref} bind:value class={cn(inputVariants({ size }), className)} {...rest} />
