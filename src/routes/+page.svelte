<script lang="ts">
	import { goto } from '$app/navigation';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../convex/_generated/api';
	import { CODE_LENGTH, isValidCode, normalizeCode } from '$lib/game';
	import { errorMessage } from '$lib/client/errors';
	import { Button, DateStamp, Field, Input, Logo } from '$lib/ui';

	const client = useConvexClient();

	let code = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	// One orchestrated moment: the date stamp rolls from 1999 up to this year once.
	const thisYear = new Date().getFullYear();
	let year = $state(1999);
	$effect(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			year = thisYear;
			return;
		}
		const id = setInterval(() => {
			year += 1;
			if (year >= thisYear) clearInterval(id);
		}, 70);
		return () => clearInterval(id);
	});

	async function join(event: SubmitEvent) {
		event.preventDefault();
		const normalized = normalizeCode(code);
		if (!isValidCode(normalized)) {
			error = `Koden har ${CODE_LENGTH} tegn, for eksempel K7P2MX.`;
			return;
		}
		busy = true;
		error = null;
		try {
			const found = await client.query(api.sessions.lookup, { code: normalized });
			if (!found) error = 'Fant ingen spill med den koden. Sjekk skjermen til verten.';
			else await goto(`/join?code=${found.code}`);
		} catch (e) {
			error = errorMessage(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Glimt – hvor og når?</title>
</svelte:head>

<main
	class="mx-auto grid min-h-dvh max-w-6xl grid-rows-[auto_1fr_auto] px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-6 sm:px-8"
>
	<Logo size="md" />

	<div class="grid items-center gap-12 py-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
		<section class="flex max-w-md flex-col gap-8">
			<div class="flex flex-col gap-4">
				<h1 class="text-5xl leading-[0.95] font-black tracking-[-0.04em] text-balance sm:text-6xl">
					Hvor og når ble bildet tatt?
				</h1>
				<p class="max-w-[38ch] text-lg text-muted">
					Verten viser bildene på storskjermen. Dere setter nål på kartet og gjetter året fra hver
					deres mobil.
				</p>
			</div>

			<form class="flex flex-col gap-3" onsubmit={join} novalidate>
				<Field label="Spillkode" {error}>
					{#snippet children({ id, describedBy, invalid })}
						<Input
							{id}
							size="lg"
							bind:value={code}
							aria-describedby={describedBy}
							aria-invalid={invalid}
							autocomplete="off"
							autocapitalize="characters"
							spellcheck="false"
							maxlength={12}
							placeholder="K7P2MX"
							data-testid="code-input"
							class="text-center text-3xl font-black tracking-[0.3em] uppercase placeholder:tracking-[0.3em] placeholder:text-subtle/60"
						/>
					{/snippet}
				</Field>
				<Button type="submit" size="lg" block loading={busy} data-testid="join-button">
					Bli med
				</Button>
			</form>

			<div class="flex items-center gap-3 text-muted">
				<span>Vil du lage et eget spill?</span>
				<Button href="/create" variant="outline" size="sm">Lag eget spill</Button>
			</div>
		</section>

		<div class="hidden justify-self-center lg:block" aria-hidden="true">
			<div class="relative w-[22rem] -rotate-3 rounded-print bg-fg p-3 pb-12 shadow-2xl">
				<div class="relative aspect-[4/5] overflow-hidden bg-sunken">
					<svg viewBox="0 0 200 250" class="h-full w-full">
						<rect width="200" height="250" fill="#1f4698" />
						<path d="M0 170 Q50 140 90 160 T200 150 V250 H0Z" fill="#163886" />
						<path d="M0 200 Q60 175 120 195 T200 190 V250 H0Z" fill="#0f2a6e" />
						<circle cx="150" cy="62" r="22" fill="#eef3ff" opacity=".9" />
						<path d="M100 128s-14-15.5-14-26a14 14 0 0 1 28 0c0 10.5-14 26-14 26Z" fill="#eef3ff" />
						<circle cx="100" cy="102" r="6" fill="#0f2a6e" />
					</svg>
					<div class="absolute right-4 bottom-3">
						<DateStamp value={`'${String(year).slice(2)}`} size="md" label="" />
					</div>
				</div>
			</div>
		</div>
	</div>

	<footer class="text-sm text-subtle">
		Kart © <a class="underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
	</footer>
</main>
