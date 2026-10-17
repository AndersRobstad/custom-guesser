<script lang="ts">
	import { Switch } from 'bits-ui';
	import { cn } from './cn';

	let {
		checked = $bindable(false),
		disabled = false,
		id,
		label,
		description,
		class: className,
		onCheckedChange
	}: {
		checked?: boolean;
		disabled?: boolean;
		id?: string;
		label: string;
		description?: string;
		class?: string;
		onCheckedChange?: (checked: boolean) => void;
	} = $props();

	const uid = $props.id();
	const switchId = $derived(id ?? uid);
</script>

<div class={cn('flex items-start justify-between gap-4', className)}>
	<label for={switchId} class="flex flex-col gap-0.5">
		<span class="text-sm font-semibold text-fg">{label}</span>
		{#if description}<span class="text-sm text-muted">{description}</span>{/if}
	</label>
	<Switch.Root
		id={switchId}
		bind:checked
		{disabled}
		{onCheckedChange}
		class={cn(
			'inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 ring-1 ring-line-strong transition-colors ring-inset',
			'data-disabled:opacity-50 data-[state=checked]:bg-success data-[state=unchecked]:bg-sunken'
		)}
	>
		<Switch.Thumb
			class="block size-6 rounded-full bg-primary shadow transition-transform data-[state=checked]:translate-x-5"
		/>
	</Switch.Root>
</div>
