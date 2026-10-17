<script lang="ts">
	import {
		ROUND_SECONDS_OPTIONS,
		YEAR_LOWER_BOUND,
		YEAR_UPPER_BOUND,
		defaultScoring,
		type GameSettings,
		type ScoringPresetKey
	} from '$lib/game';
	import {
		MAX_SCORE,
		PRESETS,
		YEAR_STRICTNESS,
		locationScore,
		yearScore,
		yearStrictnessFor,
		type PresetKey,
		type YearStrictness
	} from '$lib/scoring';
	import { Field, Input, Panel, Segmented, Switch, cn, inputVariants } from '$lib/ui';
	import { formatDistance, formatNumber, formatSeconds } from './format';
	import type { BuilderSettings } from './types';

	/** Game settings. Every change saves the full settings object through `onsave`. */
	let {
		settings,
		onsave
	}: {
		settings: BuilderSettings;
		onsave: (next: GameSettings) => Promise<boolean>;
	} = $props();

	/** Sample misses per preset for the live points table, chosen to span the useful range. */
	const SAMPLE_KM: Record<ScoringPresetKey, [number, number, number, number]> = {
		city: [0.5, 1, 3, 10],
		region: [5, 10, 25, 50],
		norway: [10, 25, 100, 250],
		europe: [25, 100, 500, 1500],
		world: [100, 500, 2000, 5000],
		custom: [10, 50, 200, 1000]
	};
	const SAMPLE_YEARS = [0, 1, 2, 5] as const;

	const strictnessOptions = Object.values(YEAR_STRICTNESS).map((s) => ({
		value: s.key,
		label: s.label,
		description: s.description
	}));

	const presetOptions = Object.values(PRESETS).map((preset) => ({
		value: preset.key,
		label: preset.label,
		description: preset.description
	}));

	const secondsOptions = $derived(
		(ROUND_SECONDS_OPTIONS as readonly number[]).includes(settings.roundSeconds)
			? [...ROUND_SECONDS_OPTIONS]
			: [...ROUND_SECONDS_OPTIONS, settings.roundSeconds].sort((a, b) => a - b)
	);

	// Year inputs: a local value while the host edits, otherwise the saved one.
	let minEdit = $state<number | null | undefined>(undefined);
	let maxEdit = $state<number | null | undefined>(undefined);
	const yearMin = $derived(minEdit === undefined ? settings.yearMin : minEdit);
	const yearMax = $derived(maxEdit === undefined ? settings.yearMax : maxEdit);

	function checkYear(year: number | null): string | null {
		if (year === null) return 'Skriv et årstall.';
		if (!Number.isInteger(year)) return 'Bruk et helt årstall.';
		if (year < YEAR_LOWER_BOUND || year > YEAR_UPPER_BOUND)
			return `Må være mellom ${YEAR_LOWER_BOUND} og ${YEAR_UPPER_BOUND}.`;
		return null;
	}

	const minError = $derived(checkYear(yearMin));
	const maxError = $derived(
		checkYear(yearMax) ??
			(yearMin !== null && yearMax !== null && yearMin > yearMax
				? 'Til-år kan ikke være før fra-år.'
				: null)
	);

	const toYear = (value: unknown) =>
		typeof value === 'number' && Number.isFinite(value) ? value : null;

	async function commitYears() {
		if (minEdit === undefined && maxEdit === undefined) return;
		if (minError || maxError || yearMin === null || yearMax === null) return;
		const sentMin = minEdit;
		const sentMax = maxEdit;
		const clear = () => {
			if (minEdit === sentMin) minEdit = undefined;
			if (maxEdit === sentMax) maxEdit = undefined;
		};
		if (yearMin === settings.yearMin && yearMax === settings.yearMax) return clear();
		await onsave({ ...settings, yearMin, yearMax });
		// On success the saved values match; on failure (toast shown) we fall back to them.
		clear();
	}

	const preset = $derived(settings.scoring.preset);
	const strictness = $derived(yearStrictnessFor(settings.scoring.kYear));

	const presetText = $derived(
		preset === 'custom'
			? `Egne verdier: full pott innenfor ${formatDistance(settings.scoring.perfectKm)}.`
			: `${PRESETS[preset].description}. Full pott innenfor ${formatDistance(settings.scoring.perfectKm)}.`
	);

	/** What typical misses are worth with the current settings. */
	const placeRow = $derived(
		SAMPLE_KM[preset].map((km) => ({ km, points: locationScore(km, settings.scoring) }))
	);
	const yearRow = $derived(
		SAMPLE_YEARS.map((diff) => ({ diff, points: yearScore(diff, settings.scoring) }))
	);

	function chooseStrictness(key: YearStrictness) {
		const kYear = YEAR_STRICTNESS[key].kYear;
		if (kYear === settings.scoring.kYear) return;
		void onsave({ ...settings, scoring: { ...settings.scoring, kYear } });
	}

	function choosePreset(key: PresetKey) {
		if (key === settings.scoring.preset) return;
		void onsave({
			...settings,
			scoring: { ...defaultScoring(key), kYear: settings.scoring.kYear }
		});
	}
</script>

<Panel as="section" aria-labelledby="settings-heading" class="flex flex-col gap-6">
	<h2 id="settings-heading" class="text-xl font-bold tracking-tight">Innstillinger</h2>

	<Field label="Tid per bilde" hint="Kan overstyres for hvert bilde.">
		{#snippet children({ id, describedBy })}
			<select
				{id}
				aria-describedby={describedBy}
				data-testid="settings-round-seconds"
				class={cn(inputVariants(), 'pr-8 [color-scheme:dark]')}
				value={String(settings.roundSeconds)}
				onchange={(event) =>
					void onsave({ ...settings, roundSeconds: Number(event.currentTarget.value) })}
			>
				{#each secondsOptions as seconds (seconds)}
					<option value={String(seconds)}>
						{seconds === 0 ? 'Ingen' : formatSeconds(seconds)}
					</option>
				{/each}
			</select>
		{/snippet}
	</Field>

	<div class="flex flex-col gap-2">
		<div class="grid grid-cols-2 gap-3">
			<Field label="Årstall fra" error={minError}>
				{#snippet children({ id, describedBy, invalid })}
					<Input
						{id}
						type="number"
						inputmode="numeric"
						min={YEAR_LOWER_BOUND}
						max={YEAR_UPPER_BOUND}
						step="1"
						aria-describedby={describedBy}
						aria-invalid={invalid}
						data-testid="settings-year-min"
						bind:value={() => yearMin ?? '', (value) => (minEdit = toYear(value))}
						onchange={commitYears}
					/>
				{/snippet}
			</Field>
			<Field label="Årstall til" error={maxError}>
				{#snippet children({ id, describedBy, invalid })}
					<Input
						{id}
						type="number"
						inputmode="numeric"
						min={YEAR_LOWER_BOUND}
						max={YEAR_UPPER_BOUND}
						step="1"
						aria-describedby={describedBy}
						aria-invalid={invalid}
						data-testid="settings-year-max"
						bind:value={() => yearMax ?? '', (value) => (maxEdit = toYear(value))}
						onchange={commitYears}
					/>
				{/snippet}
			</Field>
		</div>
		{#if !minError && !maxError}
			<p class="text-sm text-muted">Gjestene gjetter et år innenfor dette spennet.</p>
		{/if}
	</div>

	<Field label="Kartområde" hint={presetText}>
		{#snippet children({ id, describedBy })}
			<select
				{id}
				aria-describedby={describedBy}
				data-testid="settings-preset"
				class={cn(inputVariants(), 'pr-8 [color-scheme:dark]')}
				value={preset}
				onchange={(event) => choosePreset(event.currentTarget.value as PresetKey)}
			>
				{#each presetOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
				{#if preset === 'custom'}
					<option value="custom" disabled>Egne verdier</option>
				{/if}
			</select>
		{/snippet}
	</Field>

	<div class="flex flex-col gap-2" data-testid="settings-year-strictness">
		<span class="text-sm font-semibold text-fg">Årstall</span>
		<Segmented
			label="Hvor strengt årstallet teller"
			options={strictnessOptions}
			value={strictness ?? ('' as YearStrictness)}
			onValueChange={chooseStrictness}
		/>
		<p class="text-sm text-muted">
			{strictness ? YEAR_STRICTNESS[strictness].description : 'Egen verdi'}.
		</p>
	</div>

	<figure
		class="flex flex-col gap-2 rounded-md bg-sunken p-3"
		data-testid="settings-points-preview"
	>
		<figcaption class="text-sm font-semibold text-fg">
			Slik blir poengene
			<span class="font-normal text-muted">(maks {formatNumber(MAX_SCORE * 2)} per bilde)</span>
		</figcaption>
		{#snippet pointsTable(
			caption: string,
			heading: string,
			cells: { key: number; label: string; points: number }[]
		)}
			<table class="w-full table-fixed text-sm tabular">
				<caption class="sr-only">{caption}</caption>
				<thead>
					<tr>
						<th scope="row" class="w-24 py-0.5 text-left font-medium text-muted">{heading}</th>
						{#each cells as cell (cell.key)}
							<th
								scope="col"
								class="py-0.5 pl-1.5 text-right font-medium whitespace-nowrap text-muted"
								>{cell.label}</th
							>
						{/each}
					</tr>
				</thead>
				<tbody>
					<tr>
						<th scope="row" class="py-0.5 text-left font-medium text-muted">Poeng</th>
						{#each cells as cell (cell.key)}
							<td class="py-0.5 pl-1.5 text-right font-bold whitespace-nowrap text-fg"
								>{formatNumber(cell.points)}</td
							>
						{/each}
					</tr>
				</tbody>
			</table>
		{/snippet}
		{@render pointsTable(
			'Poeng for sted',
			'Bom på',
			placeRow.map((c) => ({ key: c.km, label: formatDistance(c.km), points: c.points }))
		)}
		<div class="border-t border-line"></div>
		{@render pointsTable(
			'Poeng for år',
			'År feil',
			yearRow.map((c) => ({ key: c.diff, label: String(c.diff), points: c.points }))
		)}
	</figure>

	<div data-testid="settings-shuffle">
		<Switch
			label="Tilfeldig rekkefølge hver gang"
			description="Bildene stokkes på nytt hver gang du starter spillet. Alle spillerne får samme rekkefølge."
			checked={settings.shuffleRounds ?? false}
			onCheckedChange={(checked) => void onsave({ ...settings, shuffleRounds: checked })}
		/>
	</div>

	<div data-testid="settings-host-plays">
		<Switch
			label="Verten spiller med"
			description="Av som standard – verten kjenner jo fasiten."
			checked={settings.hostPlays}
			onCheckedChange={(checked) => void onsave({ ...settings, hostPlays: checked })}
		/>
	</div>
</Panel>
