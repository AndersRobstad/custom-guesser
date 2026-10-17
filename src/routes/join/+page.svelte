<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { NAME_MAX_LENGTH, isValidCode, normalizeCode, validateName } from '$lib/game';
	import { getClientId, lastName, rememberName } from '$lib/client/identity';
	import { errorMessage } from '$lib/client/errors';
	import { Button, Field, Input, Panel, Spinner } from '$lib/ui';

	const client = useConvexClient();
	const clientId = getClientId();

	let code = $state(normalizeCode(page.url.searchParams.get('code') ?? ''));
	let name = $state(lastName());
	let codeError = $state<string | null>(null);
	let nameError = $state<string | null>(null);
	let busy = $state(false);

	const normalized = $derived(normalizeCode(code));
	const lookup = useQuery(api.sessions.lookup, () =>
		isValidCode(normalized) ? { code: normalized } : 'skip'
	);
	const existing = useQuery(api.players.state, () =>
		isValidCode(normalized) ? { code: normalized, clientId } : 'skip'
	);

	// Already in this game (e.g. scanned the QR again) → straight back in.
	$effect(() => {
		if (existing.data?.me) goto(`/play/${existing.data.session.code}`, { replaceState: true });
	});

	async function join(event: SubmitEvent) {
		event.preventDefault();
		codeError = isValidCode(normalized) ? null : 'Koden har 6 tegn, for eksempel K7P2MX.';
		nameError = validateName(name);
		if (codeError || nameError) return;
		busy = true;
		try {
			const result = await client.mutation(api.players.join, {
				code: normalized,
				clientId,
				name
			});
			rememberName(name.trim());
			await goto(`/play/${result.code}`);
		} catch (e) {
			const message = errorMessage(e);
			if (/navn/i.test(message)) nameError = message;
			else codeError = message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Bli med – Glimt</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-md flex-col">
	<AppHeader />
	<main class="flex flex-1 flex-col justify-center gap-6 px-5 pb-10">
		<div class="flex flex-col gap-2">
			<h1 class="text-4xl font-black tracking-tight">Bli med</h1>
			{#if lookup.data?.status === 'finished'}
				<p class="text-danger">Dette spillet er allerede ferdig.</p>
			{:else if lookup.data}
				<p class="text-lg text-muted">
					Du blir med i <span class="font-semibold text-fg">«{lookup.data.title}»</span>.
				</p>
			{:else}
				<p class="text-lg text-muted">Skriv inn koden fra storskjermen og velg et navn.</p>
			{/if}
		</div>

		{#if existing.data?.me}
			<Panel class="flex items-center gap-3"
				><Spinner /> Du er allerede med – sender deg inn …</Panel
			>
		{:else}
			<form class="flex flex-col gap-5" onsubmit={join} novalidate>
				<Field label="Spillkode" error={codeError}>
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
							data-testid="join-code"
							class="text-2xl font-black tracking-[0.25em] uppercase"
						/>
					{/snippet}
				</Field>
				<Field
					label="Navnet ditt"
					hint="Vises for de andre spillerne. Maks {NAME_MAX_LENGTH} tegn."
					error={nameError}
				>
					{#snippet children({ id, describedBy, invalid })}
						<Input
							{id}
							size="lg"
							bind:value={name}
							aria-describedby={describedBy}
							aria-invalid={invalid}
							autocomplete="nickname"
							maxlength={NAME_MAX_LENGTH}
							data-testid="join-name"
						/>
					{/snippet}
				</Field>
				<Button
					type="submit"
					size="lg"
					block
					loading={busy}
					disabled={lookup.data?.status === 'finished'}
					data-testid="join-submit"
				>
					Bli med
				</Button>
			</form>
		{/if}
	</main>
</div>
