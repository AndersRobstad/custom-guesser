<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { onDestroy } from 'svelte';
	import { searchPlaces, type Place } from '$lib/client/geocode';
	import { Field, Input, Spinner, cn } from '$lib/ui';
	import { nominatim } from './nominatim';

	/** Place search (OpenStreetMap Nominatim), debounced 500 ms, stale requests aborted. */
	let { onselect, class: className }: { onselect: (place: Place) => void; class?: string } =
		$props();

	const DEBOUNCE_MS = 500;
	const MIN_CHARS = 2;

	let query = $state('');
	let results = $state.raw<Place[]>([]);
	let status = $state<'idle' | 'searching' | 'done' | 'error'>('idle');
	let open = $state(false);
	let list = $state<HTMLUListElement | null>(null);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | null = null;

	function cancel() {
		clearTimeout(timer);
		controller?.abort();
		controller = null;
	}

	onDestroy(cancel);

	function schedule(delay = DEBOUNCE_MS) {
		cancel();
		const q = query.trim();
		if (q.length < MIN_CHARS) {
			results = [];
			status = 'idle';
			open = false;
			return;
		}
		status = 'searching';
		timer = setTimeout(() => run(q), delay);
	}

	async function run(q: string) {
		const ctrl = new AbortController();
		controller = ctrl;
		try {
			const found = await nominatim(() => searchPlaces(q, ctrl.signal), ctrl.signal);
			if (ctrl.signal.aborted) return;
			results = found;
			status = 'done';
		} catch {
			if (ctrl.signal.aborted) return;
			results = [];
			status = 'error';
		}
		open = true;
	}

	function choose(place: Place) {
		cancel();
		open = false;
		onselect(place);
	}

	function resultButtons() {
		return [...(list?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
	}

	function onInputKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (status === 'done' && results.length > 0 && open) choose(results[0]);
			else schedule(0);
		} else if (event.key === 'ArrowDown' && open && results.length > 0) {
			event.preventDefault();
			resultButtons()[0]?.focus();
		} else if (event.key === 'Escape' && open) {
			// Close the list without also closing a surrounding dialog.
			event.stopPropagation();
			open = false;
		}
	}

	function onResultKeydown(event: KeyboardEvent, index: number) {
		const buttons = resultButtons();
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			buttons[Math.min(index + 1, buttons.length - 1)]?.focus();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (index === 0) inputEl?.focus();
			else buttons[index - 1]?.focus();
		} else if (event.key === 'Escape') {
			event.stopPropagation();
			open = false;
			inputEl?.focus();
		}
	}

	let inputEl = $state<HTMLInputElement | null>(null);
	function onfocusout(event: FocusEvent & { currentTarget: HTMLDivElement }) {
		const next = event.relatedTarget as Node | null;
		if (!next || !event.currentTarget.contains(next)) open = false;
	}

	const statusText = $derived(
		status === 'searching'
			? 'Søker …'
			: status === 'error'
				? 'Søket feilet. Prøv igjen om litt.'
				: status === 'done'
					? results.length === 0
						? 'Fant ingen steder med det navnet.'
						: `${results.length} treff`
					: ''
	);
</script>

<div class={cn('relative', className)} {onfocusout}>
	<Field label="Søk etter sted">
		{#snippet children({ id, describedBy })}
			<div class="relative">
				<Search
					class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
					aria-hidden="true"
				/>
				<Input
					{id}
					bind:ref={inputEl}
					bind:value={query}
					type="search"
					autocomplete="off"
					spellcheck="false"
					placeholder="By, sted eller adresse"
					aria-describedby={describedBy}
					data-testid="place-search"
					class="pr-10 pl-9"
					oninput={() => schedule()}
					onkeydown={onInputKeydown}
					onfocus={() => {
						if (results.length > 0 || status === 'error') open = true;
					}}
				/>
				{#if status === 'searching'}
					<Spinner class="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
				{/if}
			</div>
		{/snippet}
	</Field>

	<p class="sr-only" aria-live="polite">{statusText}</p>

	{#if open && status !== 'searching'}
		<div
			class="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md bg-raised shadow-2xl ring-1 ring-line-strong"
		>
			{#if status === 'error' || results.length === 0}
				<p class={cn('px-3.5 py-3 text-sm', status === 'error' ? 'text-danger' : 'text-muted')}>
					{statusText}
				</p>
			{:else}
				<ul bind:this={list} class="max-h-72 overflow-y-auto py-1">
					{#each results as place, index (place.id)}
						<li>
							<button
								type="button"
								data-testid="place-result"
								class="flex w-full flex-col gap-0.5 px-3.5 py-2 text-left hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
								onmousedown={(event) => event.preventDefault()}
								onclick={() => choose(place)}
								onkeydown={(event) => onResultKeydown(event, index)}
							>
								<span class="font-semibold text-fg">{place.label}</span>
								<span class="line-clamp-1 text-xs text-muted">{place.description}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
