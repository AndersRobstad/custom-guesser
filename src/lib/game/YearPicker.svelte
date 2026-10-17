<script lang="ts">
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import { Button, Slider, cn } from '$lib/ui';

	/**
	 * Year input styled as the camera date stamp: the stamp itself is the
	 * number field, with −/+ steppers and a slider. `value` stays null until the
	 * player actually picks a year, so "Send" can't go out with a default.
	 */
	let {
		value = $bindable(null),
		min,
		max,
		disabled = false,
		class: className
	}: {
		value?: number | null;
		min: number;
		max: number;
		disabled?: boolean;
		class?: string;
	} = $props();

	const middle = $derived(Math.round((min + max) / 2));
	let draft = $state('');
	let editing = $state(false);
	const shown = $derived(editing ? draft : value === null ? '' : String(value));

	function clamp(y: number) {
		return Math.min(max, Math.max(min, Math.round(y)));
	}

	function step(delta: number) {
		value = clamp((value ?? middle) + delta);
	}

	function commitDraft() {
		editing = false;
		const n = Number(draft);
		if (draft.length === 4 && Number.isFinite(n)) value = clamp(n);
	}

	const invalidDraft = $derived(
		editing && draft.length === 4 && (Number(draft) < min || Number(draft) > max)
	);
</script>

<div class={cn('flex flex-col gap-2', className)}>
	<div class="flex items-center justify-between gap-3">
		<Button
			variant="secondary"
			size="icon"
			onclick={() => step(-1)}
			{disabled}
			aria-label="Ett år tidligere"
		>
			<Minus class="size-5" strokeWidth={3} />
		</Button>

		<label class="relative flex-1 text-center">
			<span class="sr-only">Årstall ({min}–{max})</span>
			<span
				aria-hidden="true"
				class="pointer-events-none absolute inset-0 grid place-items-center text-5xl font-bold text-stamp-ghost italic"
				style="font-family: var(--font-stamp)">8888</span
			>
			<input
				type="text"
				inputmode="numeric"
				pattern="[0-9]*"
				maxlength="4"
				autocomplete="off"
				placeholder=""
				data-testid="year-input"
				{disabled}
				value={shown}
				aria-invalid={invalidDraft}
				onfocus={() => {
					editing = true;
					draft = value === null ? '' : String(value);
				}}
				oninput={(e) => {
					draft = e.currentTarget.value.replace(/\D/g, '').slice(0, 4);
					e.currentTarget.value = draft;
					const n = Number(draft);
					if (draft.length === 4 && n >= min && n <= max) value = n;
				}}
				onblur={commitDraft}
				onkeydown={(e) => {
					if (e.key === 'Enter') e.currentTarget.blur();
					if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
						e.preventDefault();
						step(e.key === 'ArrowUp' ? 1 : -1);
					}
				}}
				class={cn(
					'relative w-full bg-transparent text-center text-5xl font-bold text-stamp italic caret-stamp',
					'[text-shadow:0_0_0.35em_var(--glimt-stamp-glow)] focus:outline-none',
					'rounded-sm focus-visible:ring-2 focus-visible:ring-stamp/60',
					invalidDraft && 'text-danger'
				)}
				style="font-family: var(--font-stamp)"
			/>
		</label>

		<Button
			variant="secondary"
			size="icon"
			onclick={() => step(1)}
			{disabled}
			aria-label="Ett år senere"
		>
			<Plus class="size-5" strokeWidth={3} />
		</Button>
	</div>

	<Slider
		bind:value={() => value ?? middle, (v) => (value = clamp(v))}
		{min}
		{max}
		{disabled}
		tone={value === null ? 'default' : 'stamp'}
		label="Årstall"
		valueText={value === null ? 'Ikke valgt' : String(value)}
	/>
	<div class="flex justify-between text-xs font-semibold text-subtle tabular">
		<span>{min}</span>
		{#if value === null}<span class="text-muted">Velg år</span>{/if}
		<span>{max}</span>
	</div>
</div>
