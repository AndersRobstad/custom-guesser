<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { TITLE_MAX_LENGTH } from '$lib/game';
	import { Field, Input } from '$lib/ui';

	/**
	 * Game title, saved 800 ms after typing stops and on blur. While the host is
	 * typing, the local text wins over the server value.
	 */
	let {
		title,
		onsave,
		autofocus = false
	}: {
		title: string;
		onsave: (title: string) => Promise<boolean>;
		/** Focus and select the title on mount (for brand-new games). */
		autofocus?: boolean;
	} = $props();

	const SAVE_DELAY_MS = 800;

	let edit = $state<string | null>(null);
	let status = $state<'idle' | 'saving' | 'saved'>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;

	const value = $derived(edit ?? title);
	const error = $derived(value.trim() === '' ? 'Spillet må ha en tittel.' : null);
	const hint = $derived(
		status === 'saving'
			? 'Lagrer …'
			: status === 'saved'
				? 'Lagret.'
				: 'Vises for gjestene når de blir med.'
	);

	onDestroy(() => clearTimeout(timer));

	const normalize = (text: string) => text.trim().replace(/\s+/g, ' ');

	async function commit() {
		clearTimeout(timer);
		const sent = edit;
		if (sent === null) return;
		const next = normalize(sent);
		if (!next) return;
		if (next === title) {
			if (edit === sent && sent === next) edit = null;
			return;
		}
		status = 'saving';
		const ok = await onsave(next);
		status = ok ? 'saved' : 'idle';
		// Drop the local copy unless the host has typed more in the meantime.
		if (edit === sent && (sent === next || !ok)) edit = null;
	}

	function oninput() {
		status = 'idle';
		clearTimeout(timer);
		timer = setTimeout(commit, SAVE_DELAY_MS);
	}

	async function onblur() {
		await commit();
		// Show the cleaned-up title, or restore the saved one if the field was emptied.
		if (edit !== null && (normalize(edit) === title || !normalize(edit))) edit = null;
	}

	function focusOnMount(node: HTMLInputElement) {
		if (untrack(() => autofocus)) {
			node.focus();
			node.select();
		}
	}
</script>

<Field label="Tittel" {hint} {error}>
	{#snippet children({ id, describedBy, invalid })}
		<Input
			{id}
			size="lg"
			maxlength={TITLE_MAX_LENGTH}
			autocomplete="off"
			aria-describedby={describedBy}
			aria-invalid={invalid}
			data-testid="game-title"
			class="text-2xl font-bold tracking-tight sm:h-16 sm:text-3xl"
			bind:value={() => value, (next) => (edit = String(next ?? ''))}
			{oninput}
			{onblur}
			onkeydown={(event) => {
				if (event.key === 'Enter') void commit();
			}}
			{@attach focusOnMount}
		/>
	{/snippet}
</Field>
