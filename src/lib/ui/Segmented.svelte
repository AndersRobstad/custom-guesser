<script lang="ts" generics="T extends string">
	import { RadioGroup } from 'bits-ui';
	import { cn } from './cn';

	/** A row of mutually exclusive options (headless RadioGroup underneath). */
	let {
		value = $bindable(),
		options,
		label,
		disabled = false,
		class: className,
		onValueChange
	}: {
		value: T;
		options: { value: T; label: string; description?: string }[];
		/** Accessible name for the group. */
		label: string;
		disabled?: boolean;
		class?: string;
		onValueChange?: (value: T) => void;
	} = $props();
</script>

<RadioGroup.Root
	bind:value={() => value, (v) => (value = v as T)}
	onValueChange={(v) => onValueChange?.(v as T)}
	{disabled}
	aria-label={label}
	orientation="horizontal"
	class={cn('flex flex-wrap gap-1 rounded-md bg-sunken p-1', className)}
>
	{#each options as option (option.value)}
		<RadioGroup.Item
			value={option.value}
			title={option.description}
			class={cn(
				'min-h-9 flex-1 rounded-sm px-3 py-1.5 text-sm font-semibold text-muted transition-colors',
				'hover:text-fg data-[state=checked]:bg-primary data-[state=checked]:text-primary-fg'
			)}
		>
			{option.label}
		</RadioGroup.Item>
	{/each}
</RadioGroup.Root>
