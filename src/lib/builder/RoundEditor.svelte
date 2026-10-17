<script lang="ts">
	import Film from '@lucide/svelte/icons/film';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { Snippet } from 'svelte';
	import MapView from '$lib/map/MapView.svelte';
	import type { MapMarker } from '$lib/map/types';
	import {
		Button,
		DateStamp,
		Field,
		Input,
		Print,
		Spinner,
		Textarea,
		cn,
		inputVariants
	} from '$lib/ui';
	import { CAPTION_MAX_LENGTH, LABEL_MAX_LENGTH } from '$lib/game';
	import { formatLatLng, formatSeconds, joinList } from './format';
	import type { MapStart } from './map-start';
	import PlaceSearch from './PlaceSearch.svelte';
	import type { RoundDraft } from './round-draft.svelte';
	import type { BuilderSettings } from './types';
	import { MEDIA_ACCEPT, formatDuration } from './video';

	/** Fields for one round: media, answer pin, year, label, caption and time limit. */
	let {
		draft,
		settings,
		mapStart,
		onsave,
		saveLabel = 'Lagre runde',
		secondary
	}: {
		draft: RoundDraft;
		settings: BuilderSettings;
		mapStart: MapStart;
		onsave: () => void;
		saveLabel?: string;
		/** Extra buttons left of the save button (e.g. "Fjern" or "Avbryt"). */
		secondary?: Snippet;
	} = $props();

	const SECONDS_OVERRIDES = [5, 10, 20, 30, 45, 60, 90, 120, 180];

	let yearTouched = $state(false);
	/** Length reported by the preview player (saved videos don't carry it). */
	let playerDuration = $state<number>();
	let replaceInput = $state<HTMLInputElement | null>(null);

	const range = $derived({ yearMin: settings.yearMin, yearMax: settings.yearMax });
	const duration = $derived(
		draft.duration ?? (playerDuration && Number.isFinite(playerDuration) ? playerDuration : null)
	);
	const fileLabel = $derived(
		draft.fileName || (draft.roundId && !draft.isVideo ? 'Lagret bilde' : '')
	);
	const missing = $derived(draft.missing(range));
	const ready = $derived(draft.isReady(range));
	const yearError = $derived(draft.yearError(range));
	const showYearError = $derived(
		!!yearError && (yearTouched || String(draft.year ?? '').length >= 4)
	);
	const validYear = $derived(draft.year !== null && !yearError ? draft.year : null);

	const pin = $derived(
		draft.lat !== null && draft.lng !== null && draft.hasPosition
			? { lat: draft.lat, lng: draft.lng }
			: null
	);
	const markers = $derived<MapMarker[]>(
		pin ? [{ id: 'answer', ...pin, kind: 'answer', label: draft.label.trim() || 'Fasit' }] : []
	);

	const secondsOptions = $derived.by(() => {
		const values = [...SECONDS_OVERRIDES];
		const current = Number(draft.roundSeconds);
		if (draft.roundSeconds !== '' && current > 0 && !values.includes(current)) {
			values.push(current);
			values.sort((a, b) => a - b);
		}
		return values;
	});

	const exifNote = $derived.by(() => {
		if (draft.isVideo || !draft.exif) return null;
		if (draft.yearFromExif && draft.positionFromExif)
			return 'Årstall og posisjon er hentet fra bildet.';
		if (draft.yearFromExif) return 'Årstallet er hentet fra bildet.';
		if (draft.positionFromExif) return 'Posisjonen er hentet fra bildet.';
		const { year } = draft.exif;
		if (year !== undefined && draft.year === null && (year < range.yearMin || year > range.yearMax))
			return `Bildet er merket ${year}, som er utenfor ${range.yearMin}–${range.yearMax}.`;
		return null;
	});

	const statusText = $derived(
		draft.saving
			? draft.isVideo && draft.media
				? 'Laster opp video …'
				: 'Lagrer …'
			: draft.processing
				? 'Gjør klart filen …'
				: missing.length > 0
					? `Mangler ${joinList(missing)}.`
					: 'Klar til å lagres.'
	);

	function onReplace(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (file) void draft.loadFile(file, range);
	}
</script>

{#snippet videoPlayer()}
	<video
		src={draft.videoUrl}
		poster={draft.previewUrl ?? undefined}
		controls
		muted
		playsinline
		preload="metadata"
		class="h-full w-full bg-sunken object-contain"
		data-testid="round-video"
		bind:duration={playerDuration}
	></video>
{/snippet}

{#snippet yearStamp()}
	<DateStamp value={validYear ?? ''} label="År {validYear}" size="md" />
{/snippet}

<div class="flex flex-col gap-5" data-testid="round-editor">
	<div class="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6">
		<div class="flex min-w-0 flex-col gap-4">
			<div class="relative">
				<Print
					src={draft.previewUrl}
					alt={draft.fileName ? `Forhåndsvisning av ${draft.fileName}` : 'Forhåndsvisning'}
					class="aspect-[4/3] w-full"
					children={draft.isVideo && draft.videoUrl ? videoPlayer : undefined}
					stamp={validYear !== null && !draft.isVideo ? yearStamp : undefined}
				/>
				{#if draft.processing}
					<div
						class="absolute inset-1.5 grid place-items-center rounded-print bg-sunken/80 sm:inset-2"
					>
						<span class="flex items-center gap-2 text-sm font-semibold text-fg">
							<Spinner class="size-4" label="Gjør klart filen" />
							Gjør klart …
						</span>
					</div>
				{:else if draft.mediaError && !draft.hasMedia}
					<div
						class="absolute inset-1.5 grid place-items-center rounded-print bg-sunken p-4 text-center sm:inset-2"
					>
						<p class="text-sm font-semibold text-danger">{draft.mediaError}</p>
					</div>
				{/if}
			</div>

			<div class="flex items-center justify-between gap-3">
				<p class="flex min-w-0 items-center gap-1.5 text-sm text-muted">
					{#if draft.isVideo}
						<Film class="size-4 shrink-0" aria-hidden="true" />
						<span class="shrink-0 font-semibold text-fg">
							Video{duration ? ` · ${formatDuration(duration)}` : ''}
						</span>
					{/if}
					<span class="truncate">{fileLabel}</span>
				</p>
				<input
					bind:this={replaceInput}
					type="file"
					accept={MEDIA_ACCEPT}
					class="sr-only"
					tabindex="-1"
					aria-hidden="true"
					data-testid="replace-media"
					onchange={onReplace}
				/>
				<Button
					variant="outline"
					size="sm"
					class="shrink-0"
					disabled={draft.processing || draft.saving}
					onclick={() => replaceInput?.click()}
				>
					<RefreshCw class="size-4" aria-hidden="true" />
					Bytt fil
				</Button>
			</div>

			{#if draft.mediaError && draft.hasMedia}
				<p class="text-sm font-medium text-danger" role="alert">{draft.mediaError}</p>
			{/if}
			{#if draft.mediaWarning}
				<p
					class="flex items-start gap-2 rounded-md bg-sunken px-3 py-2 text-sm text-warning"
					data-testid="media-warning"
				>
					<TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					{draft.mediaWarning}
				</p>
			{/if}
			{#if draft.isVideo && draft.media}
				<p class="text-sm text-muted">År og sted må settes manuelt for video.</p>
			{:else if exifNote}
				<p class="text-sm text-muted">{exifNote}</p>
			{/if}

			<div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
				<Field
					label="År"
					hint="{settings.yearMin}–{settings.yearMax}"
					error={showYearError ? yearError : null}
				>
					{#snippet children({ id, describedBy, invalid })}
						<Input
							{id}
							type="number"
							inputmode="numeric"
							min={settings.yearMin}
							max={settings.yearMax}
							step="1"
							placeholder="ÅÅÅÅ"
							aria-describedby={describedBy}
							aria-invalid={invalid}
							data-testid="round-year"
							bind:value={() => draft.year ?? '', (value) => draft.setYear(value)}
							onblur={() => (yearTouched = true)}
						/>
					{/snippet}
				</Field>
				<Field label="Tidsgrense">
					{#snippet children({ id, describedBy })}
						<select
							{id}
							aria-describedby={describedBy}
							data-testid="round-seconds"
							class={cn(inputVariants(), 'pr-8 [color-scheme:dark]')}
							bind:value={draft.roundSeconds}
						>
							<option value="">Standard ({formatSeconds(settings.roundSeconds)})</option>
							<option value="0">Ingen tidsgrense</option>
							{#each secondsOptions as seconds (seconds)}
								<option value={String(seconds)}>{formatSeconds(seconds)}</option>
							{/each}
						</select>
					{/snippet}
				</Field>
			</div>

			<Field label="Bildetekst" hint="Valgfritt. Vises sammen med fasiten.">
				{#snippet children({ id, describedBy })}
					<Textarea
						{id}
						aria-describedby={describedBy}
						maxlength={CAPTION_MAX_LENGTH}
						rows={2}
						placeholder="En liten historie om bildet"
						data-testid="round-caption"
						bind:value={() => draft.caption, (value) => (draft.caption = value ?? '')}
					/>
				{/snippet}
			</Field>
		</div>

		<div class="flex min-w-0 flex-col gap-4">
			<PlaceSearch class="z-10" onselect={(place) => draft.applyPlace(place)} />

			<div class="flex flex-col gap-2">
				<div class="overflow-hidden rounded-md ring-1 ring-line-strong">
					<MapView
						pickable
						onpick={(position) => draft.placePin(position)}
						{markers}
						focus={draft.focus}
						center={pin ?? mapStart.center}
						zoom={pin ? mapStart.pinZoom : mapStart.zoom}
						label="Kart. Klikk der bildet er tatt for å sette fasiten."
						class="h-[300px] lg:h-[340px]"
						data-testid="round-map"
					/>
				</div>
				<p class="flex items-center gap-1.5 text-sm text-muted" data-testid="round-position">
					{#if pin}
						<MapPin class="size-4 shrink-0 text-stamp" aria-hidden="true" />
						<span class="tabular">{formatLatLng(pin.lat, pin.lng)}</span>
						{#if draft.positionFromExif}<span>· fra bildet</span>{/if}
					{:else}
						Klikk på kartet der bildet er tatt, eller søk etter stedet.
					{/if}
				</p>
			</div>

			<Field
				label="Stedsnavn"
				hint={draft.labelLoading ? 'Finner stedsnavn …' : 'Valgfritt. Vises når fasiten avsløres.'}
			>
				{#snippet children({ id, describedBy })}
					<Input
						{id}
						aria-describedby={describedBy}
						maxlength={LABEL_MAX_LENGTH}
						placeholder="f.eks. Bryggen, Bergen"
						data-testid="round-label"
						bind:value={() => draft.label, (value) => draft.setLabel(String(value ?? ''))}
					/>
				{/snippet}
			</Field>
		</div>
	</div>

	<div class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-line pt-4">
		<p
			class={cn('mr-auto text-sm', ready ? 'text-success' : 'text-muted')}
			aria-live="polite"
			data-testid="round-missing"
		>
			{statusText}
		</p>
		{@render secondary?.()}
		<Button data-testid="save-round" disabled={!ready} loading={draft.saving} onclick={onsave}>
			{saveLabel}
		</Button>
	</div>
</div>
