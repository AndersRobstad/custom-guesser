<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from './cn';

	/**
	 * Label + control + hint/error. The control snippet receives the ids to wire up
	 * `id`, `aria-describedby` and `aria-invalid`.
	 */
	let {
		label,
		hint,
		error,
		id: idProp,
		class: className,
		children
	}: {
		label: string;
		hint?: string | null;
		error?: string | null;
		id?: string;
		class?: string;
		children: Snippet<[{ id: string; describedBy: string | undefined; invalid: boolean }]>;
	} = $props();

	const uid = $props.id();
	const id = $derived(idProp ?? uid);
	const describedBy = $derived(error ? `${id}-error` : hint ? `${id}-hint` : undefined);
</script>

<div class={cn('flex flex-col gap-1.5', className)}>
	<label for={id} class="text-sm font-semibold text-fg">{label}</label>
	{@render children({ id, describedBy, invalid: !!error })}
	{#if error}
		<p id="{id}-error" class="text-sm font-medium text-danger" role="alert">{error}</p>
	{:else if hint}
		<p id="{id}-hint" class="text-sm text-muted">{hint}</p>
	{/if}
</div>
