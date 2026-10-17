<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { cn } from './cn';
	import { inputVariants } from './Input.svelte';

	type Props = Omit<HTMLTextareaAttributes, 'class'> & { class?: string; value?: string | null };

	let { class: className, value = $bindable(), ...rest }: Props = $props();
</script>

<textarea
	bind:value
	class={cn(inputVariants(), 'h-auto min-h-20 resize-y py-2.5 leading-snug', className)}
	{...rest}></textarea>
