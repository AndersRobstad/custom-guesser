<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from './cn';
	import { inputVariants } from './variants';

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
