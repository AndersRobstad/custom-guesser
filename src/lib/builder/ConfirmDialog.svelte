<script lang="ts">
	import { Button, Dialog } from '$lib/ui';

	/** A small "are you sure" dialog for destructive actions. */
	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel,
		busy = false,
		onconfirm
	}: {
		open?: boolean;
		title: string;
		description?: string;
		confirmLabel: string;
		busy?: boolean;
		onconfirm: () => void;
	} = $props();
</script>

<Dialog bind:open {title} {description} size="sm">
	{#snippet footer()}
		<Button variant="ghost" disabled={busy} onclick={() => (open = false)}>Avbryt</Button>
		<Button variant="danger" loading={busy} data-testid="confirm-delete" onclick={onconfirm}>
			{confirmLabel}
		</Button>
	{/snippet}
</Dialog>
