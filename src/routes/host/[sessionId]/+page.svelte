<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { errorMessage } from '$lib/client/errors';
	import { startHeartbeat } from '$lib/client/heartbeat';
	import { getClientId } from '$lib/client/identity';
	import HostFinal from '$lib/game/host/HostFinal.svelte';
	import HostLobby from '$lib/game/host/HostLobby.svelte';
	import HostReveal from '$lib/game/host/HostReveal.svelte';
	import HostRound from '$lib/game/host/HostRound.svelte';
	import { Button, Dialog, Spinner, playerColors, toast } from '$lib/ui';

	const client = useConvexClient();
	const clientId = getClientId();
	const sessionParam = $derived(page.params.sessionId ?? '');

	const query = useQuery(api.sessions.hostState, () => ({ sessionId: sessionParam, clientId }), {
		keepPreviousData: true
	});
	const data = $derived(query.data);
	const status = $derived(data?.session.status);
	const sessionId = $derived(data?.session._id);
	const colors = $derived(playerColors(data?.standings ?? []));

	let pending = $state<'start' | 'reveal' | 'next' | 'end' | 'restart' | null>(null);
	let confirmEnd = $state(false);

	$effect(() => {
		if (!sessionId || status === 'finished') return;
		const id = sessionId;
		return startHeartbeat(() =>
			client.mutation(api.sessions.hostHeartbeat, { sessionId: id, clientId })
		);
	});

	async function run(kind: NonNullable<typeof pending>, action: () => Promise<unknown>) {
		pending = kind;
		try {
			await action();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			pending = null;
		}
	}

	const hostArgs = () => ({ sessionId: sessionId!, clientId });
	const start = () => run('start', () => client.mutation(api.sessions.start, hostArgs()));
	const reveal = () => run('reveal', () => client.mutation(api.sessions.revealNow, hostArgs()));
	const next = () => run('next', () => client.mutation(api.sessions.next, hostArgs()));
	const end = () =>
		run('end', async () => {
			await client.mutation(api.sessions.end, hostArgs());
			confirmEnd = false;
		});
	const restart = () =>
		run('restart', async () => {
			const created = await client.mutation(api.sessions.create, {
				gameId: data!.gameId,
				clientId
			});
			await goto(`/host/${created.sessionId}`);
		});

	function onkeydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.key !== ' ' && e.key !== 'Enter') return;
		if (pending || confirmEnd || !data) return;
		if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
		// Space/Enter advances the game like a presenter clicker.
		const action =
			status === 'reveal'
				? next
				: status === 'playing'
					? reveal
					: status === 'lobby' && data.playerCount > 0
						? start
						: null;
		if (!action) return;
		e.preventDefault();
		action();
	}
</script>

<svelte:window {onkeydown} />

<svelte:head>
	<title>{data ? `${data.session.title} – vert – Glimt` : 'Vert – Glimt'}</title>
</svelte:head>

<div class="flex h-dvh min-w-[60rem] flex-col" data-testid="host-page" data-status={status}>
	<AppHeader class="shrink-0 px-8 py-4">
		{#if data}
			<span class="mr-4 hidden truncate text-lg font-semibold text-muted xl:inline">
				{data.session.title}
			</span>
			{#if status !== 'lobby' && status !== 'finished'}
				<span class="rounded-full bg-raised px-4 py-1.5 text-lg font-semibold">
					Bli med: <span class="font-black tracking-[0.12em]" data-testid="header-code"
						>{data.session.code}</span
					>
				</span>
			{/if}
			{#if status !== 'finished'}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => (confirmEnd = true)}
					data-testid="end-session"
				>
					Avslutt
				</Button>
			{/if}
		{/if}
	</AppHeader>

	{#if query.isLoading && !data}
		<div class="grid flex-1 place-items-center"><Spinner class="size-10" /></div>
	{:else if !data}
		<main class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
			<h1 class="text-4xl font-black">Fant ikke økten</h1>
			<p class="max-w-md text-lg text-muted">
				Økten finnes ikke, eller den ble startet fra en annen nettleser. Bare verten kan styre et
				spill.
			</p>
			<Button href="/create">Til mine spill</Button>
		</main>
	{:else if status === 'lobby'}
		<HostLobby {data} {colors} starting={pending === 'start'} onstart={start} />
	{:else if status === 'playing' && data.round}
		<HostRound {data} {colors} revealing={pending === 'reveal'} onreveal={reveal} />
	{:else if status === 'reveal' && data.round?.answer}
		<HostReveal {data} {colors} advancing={pending === 'next'} onnext={next} />
	{:else if status === 'finished'}
		<HostFinal {data} {colors} restarting={pending === 'restart'} onrestart={restart} />
	{/if}
</div>

<Dialog
	bind:open={confirmEnd}
	title="Avslutte spillet?"
	description="Spillet avsluttes for alle, og resultatlisten vises med poengene så langt."
	size="sm"
>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmEnd = false)}>Fortsett å spille</Button>
		<Button variant="danger" onclick={end} loading={pending === 'end'} data-testid="confirm-end">
			Avslutt spillet
		</Button>
	{/snippet}
</Dialog>
