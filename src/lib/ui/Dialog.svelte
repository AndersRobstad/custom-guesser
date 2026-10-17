<script lang="ts">
	import { Dialog } from 'bits-ui';
	import X from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';
	import { cn } from './cn';

	let {
		open = $bindable(false),
		title,
		description,
		size = 'md',
		class: className,
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		description?: string;
		size?: 'sm' | 'md' | 'lg' | 'full';
		class?: string;
		children?: Snippet;
		footer?: Snippet;
	} = $props();

	const sizes = {
		sm: 'max-w-sm',
		md: 'max-w-lg',
		lg: 'max-w-3xl',
		full: 'max-w-[min(96vw,1400px)] h-[94dvh]'
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-[1000] bg-sunken/80 backdrop-blur-sm data-[state=open]:animate-[rise_200ms_ease-out]"
		/>
		<Dialog.Content
			class={cn(
				'fixed top-1/2 left-1/2 z-[1001] flex max-h-[94dvh] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
				'rounded-lg bg-surface text-fg shadow-2xl ring-1 ring-line-strong focus:outline-none',
				sizes[size],
				className
			)}
		>
			<div class="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
				<div class="flex flex-col gap-1">
					<Dialog.Title class="text-xl font-bold tracking-tight">{title}</Dialog.Title>
					{#if description}
						<Dialog.Description class="text-sm text-muted">{description}</Dialog.Description>
					{/if}
				</div>
				<Dialog.Close
					class="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-sm text-muted hover:bg-raised hover:text-fg"
					aria-label="Lukk"
				>
					<X class="size-5" />
				</Dialog.Close>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
				{@render children?.()}
			</div>
			{#if footer}
				<div class="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
					{@render footer()}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
