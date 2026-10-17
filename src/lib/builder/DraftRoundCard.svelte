<script lang="ts">
	import { Button, Panel } from '$lib/ui';
	import type { MapStart } from './map-start';
	import type { RoundDraft } from './round-draft.svelte';
	import RoundEditor from './RoundEditor.svelte';
	import type { BuilderSettings } from './types';

	/** A new, unsaved round. Nothing is uploaded until "Lagre runde". */
	let {
		draft,
		number,
		settings,
		mapStart,
		onsave,
		onremove
	}: {
		draft: RoundDraft;
		/** The round number it will get when saved now. */
		number: number;
		settings: BuilderSettings;
		mapStart: MapStart;
		onsave: () => void;
		onremove: () => void;
	} = $props();
</script>

<Panel
	as="article"
	id={draft.key}
	aria-labelledby="{draft.key}-title"
	data-testid="draft-round"
	class="scroll-mt-6"
>
	<header class="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
		<h4 id="{draft.key}-title" class="text-lg font-bold tracking-tight">Ny runde {number}</h4>
		<span class="text-sm text-muted">Ikke lagret ennå</span>
	</header>
	<RoundEditor {draft} {settings} {mapStart} {onsave}>
		{#snippet secondary()}
			<Button variant="ghost" disabled={draft.saving} data-testid="remove-draft" onclick={onremove}>
				Fjern
			</Button>
		{/snippet}
	</RoundEditor>
</Panel>
