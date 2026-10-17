<script lang="ts">
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from '$lib/game';
	import { cn } from '$lib/ui';
	import { MEDIA_ACCEPT } from './video';

	/**
	 * Drop target and file picker for new rounds. The `<input>` stays in the DOM
	 * (visually hidden) so tests can use `setInputFiles` on `image-upload`.
	 */
	let {
		onfiles,
		compact = false,
		input = $bindable(null)
	}: {
		onfiles: (files: File[]) => void;
		compact?: boolean;
		input?: HTMLInputElement | null;
	} = $props();

	const id = $props.id();
	let dragging = $state(false);

	const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

	function ondragover(event: DragEvent) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
		dragging = true;
	}

	function ondragleave(event: DragEvent) {
		const next = event.relatedTarget as Node | null;
		if (!next || !(event.currentTarget as HTMLElement).contains(next)) dragging = false;
	}

	function ondrop(event: DragEvent) {
		if (!hasFiles(event)) return;
		// Marks the drop as handled so the page-level drop handler skips it.
		event.preventDefault();
		dragging = false;
		const files = [...(event.dataTransfer?.files ?? [])];
		if (files.length > 0) onfiles(files);
	}

	function onchange(event: Event & { currentTarget: HTMLInputElement }) {
		const files = [...(event.currentTarget.files ?? [])];
		event.currentTarget.value = '';
		if (files.length > 0) onfiles(files);
	}
</script>

<label
	for={id}
	class={cn(
		'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-strong px-6 text-center transition-colors',
		'hover:border-fg hover:bg-surface has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--glimt-focus)]',
		dragging && 'border-fg bg-surface',
		compact ? 'py-8' : 'py-14 sm:py-20'
	)}
	{ondragover}
	{ondragleave}
	{ondrop}
	data-testid="media-dropzone"
>
	<input
		{id}
		bind:this={input}
		type="file"
		accept={MEDIA_ACCEPT}
		multiple
		class="sr-only"
		data-testid="image-upload"
		{onchange}
	/>
	<ImagePlus
		class={cn('text-muted transition-colors group-hover:text-fg', compact ? 'size-7' : 'size-10')}
		aria-hidden="true"
	/>
	<span class={cn('font-bold text-fg', compact ? 'text-base' : 'text-xl')}>
		{dragging ? 'Slipp filene her' : 'Slipp bilder her, eller velg fra maskinen'}
	</span>
	<span class="max-w-md text-sm text-muted">
		Hvert bilde blir én runde. Korte videoer fungerer også (maks {MAX_VIDEO_SECONDS} s / {MAX_VIDEO_BYTES /
			1024 /
			1024} MB). Årstall og posisjon hentes fra bildet når det finnes.
	</span>
</label>
