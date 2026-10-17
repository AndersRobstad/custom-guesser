<script lang="ts">
	import {
		ROUND_SECONDS_OPTIONS,
		YEAR_LOWER_BOUND,
		YEAR_UPPER_BOUND,
		defaultScoring,
		type GameSettings,
		type ScoringPresetKey
	} from '$lib/game';
	import { MAX_SCORE, PRESETS, locationScore, type PresetKey } from '$lib/scoring';
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

	/** Two sample misses per preset, chosen so both give a telling score. */
	const SAMPLE_KM: Record<ScoringPresetKey, [number, number]> = {
		city: [1, 5],
		norway: [20, 100],
		europe: [50, 500],
		world: [500, 2000],
		custom: [50, 500]
	};

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
	const scoreExample = $derived.by(() => {
		const scoring = settings.scoring;
		const [near, far] = SAMPLE_KM[scoring.preset];
		const points = (km: number) => formatNumber(locationScore(km, scoring));
		return (
			`Innenfor ${formatDistance(scoring.perfectKm)} gir ${formatNumber(MAX_SCORE)} poeng. ` +
			`Bom på ${formatDistance(near)} gir ${points(near)} poeng, ${formatDistance(far)} gir ${points(far)}.`
		);
	});

	const presetText = $derived(
		preset === 'custom' ? scoreExample : `${PRESETS[preset].description}. ${scoreExample}`
	);

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

	<div class="flex flex-col gap-2" data-testid="settings-preset">
		<span class="text-sm font-semibold text-fg">Kartområde</span>
		<Segmented
			label="Kartområde"
			options={presetOptions}
			value={preset === 'custom' ? ('' as PresetKey) : preset}
			onValueChange={choosePreset}
		/>
		<p class="text-sm text-muted">{presetText}</p>
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
