<script lang="ts">
	import { cn } from './cn';
	import { toast } from './toast.svelte';
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-4 z-[1100] flex flex-col items-center gap-2 px-4"
	aria-live="polite"
>
	{#each toast.items as item (item.id)}
		<button
			type="button"
			onclick={() => toast.dismiss(item.id)}
			class={cn(
				'pointer-events-auto max-w-md animate-rise rounded-md px-4 py-3 text-left text-sm font-semibold shadow-xl ring-1',
				item.tone === 'error' && 'bg-danger text-bg ring-black/10',
				item.tone === 'success' && 'bg-success text-bg ring-black/10',
				item.tone === 'info' && 'bg-primary text-primary-fg ring-black/10'
			)}
			role={item.tone === 'error' ? 'alert' : 'status'}
		>
			{item.message}
		</button>
	{/each}
</div>
