<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import Play from '@lucide/svelte/icons/play';
	import type { OptimisticLocalStore } from 'convex/browser';
	import { useConvexClient } from 'convex-svelte';
	import { onDestroy, tick } from 'svelte';
	import { errorMessage } from '$lib/client/errors';
	import { uploadToConvex } from '$lib/client/image';
	import type { GameSettings } from '$lib/game';
	import { Button, Dialog, Panel, toast } from '$lib/ui';
	import { api } from '../../convex/_generated/api';
	import type { Id } from '../../convex/_generated/dataModel';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import DraftRoundCard from './DraftRoundCard.svelte';
	import { countLabel } from './format';
	import { mapStart as startView } from './map-start';
	import MediaDropzone from './MediaDropzone.svelte';
	import { RoundDraft } from './round-draft.svelte';
	import RoundEditor from './RoundEditor.svelte';
	import RoundList from './RoundList.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import TitleField from './TitleField.svelte';
	import type { GameDetails, SavedRound } from './types';
	import { isImageFile, isVideoFile } from './video';

	/** The whole game builder for one loaded game. */
	let {
		details,
		gameId,
		clientId
	}: {
		details: GameDetails;
		/** The id exactly as passed to `games.get` (used for optimistic updates). */
		gameId: string;
		clientId: string;
	} = $props();

	const client = useConvexClient();

	const game = $derived(details.game);
	const settings = $derived(game.settings);
	const rounds = $derived(details.rounds);
	const range = $derived({ yearMin: settings.yearMin, yearMax: settings.yearMax });
	const mapStart = $derived(startView(settings.scoring.preset, rounds.at(-1)));

	let drafts = $state<RoundDraft[]>([]);
	let dropInput = $state<HTMLInputElement | null>(null);
	let savingAll = $state(false);
	let starting = $state(false);

	const readyCount = $derived(drafts.filter((draft) => draft.isReady(range)).length);
	const unsavedText = $derived(
		drafts.length === 1 ? 'Du har 1 ulagret bilde' : `Du har ${drafts.length} ulagrede bilder`
	);
	const startBlocker = $derived(
		drafts.length > 0
			? `${unsavedText}. Lagre eller fjern ${drafts.length === 1 ? 'det' : 'dem'} før du starter.`
			: rounds.length === 0
				? 'Legg til minst ett bilde for å starte.'
				: null
	);

	onDestroy(() => {
		for (const draft of drafts) draft.dispose();
		editDraft?.dispose();
	});

	// ---------------------------------------------------------------------------
	// Saving
	// ---------------------------------------------------------------------------

	function patchDetails(store: OptimisticLocalStore, update: (d: GameDetails) => GameDetails) {
		const args = { gameId, clientId };
		const current = store.getQuery(api.games.get, args);
		if (current) store.setQuery(api.games.get, args, update(current));
	}

	/** Runs a mutation and shows a toast if it fails. */
	async function attempt(task: () => Promise<unknown>): Promise<boolean> {
		try {
			await task();
			return true;
		} catch (error) {
			toast.error(errorMessage(error));
			return false;
		}
	}

	const saveTitle = (title: string) =>
		attempt(() =>
			client.mutation(
				api.games.update,
				{ gameId: game._id, clientId, title },
				{
					optimisticUpdate: (store) =>
						patchDetails(store, (d) => ({ ...d, game: { ...d.game, title } }))
				}
			)
		);

	const saveSettings = (next: GameSettings) =>
		attempt(() =>
			client.mutation(
				api.games.update,
				{ gameId: game._id, clientId, settings: next },
				{
					optimisticUpdate: (store) =>
						patchDetails(store, (d) => ({ ...d, game: { ...d.game, settings: next } }))
				}
			)
		);

	async function upload(blob: Blob) {
		const url = await client.mutation(api.rounds.generateUploadUrl, { clientId });
		return (await uploadToConvex(url, blob)) as Id<'_storage'>;
	}

	/** Uploads new media (and a video's poster) once; otherwise reuses the saved files. */
	async function mediaArgs(draft: RoundDraft) {
		const { media, poster } = draft;
		if (!media) {
			if (!draft.savedImageId) throw new Error('Round has no media');
			return {
				imageId: draft.savedImageId,
				mediaType: draft.savedMediaType,
				...(draft.savedPosterId ? { posterId: draft.savedPosterId } : {})
			};
		}
		let uploaded = draft.uploaded;
		if (!uploaded || uploaded.media !== media) {
			const [imageId, posterId] = await Promise.all([
				upload(media),
				draft.isVideo && poster ? upload(poster) : undefined
			]);
			uploaded = { media, imageId, posterId };
			draft.uploaded = uploaded;
		}
		return {
			imageId: uploaded.imageId,
			mediaType: draft.mediaType,
			...(uploaded.posterId ? { posterId: uploaded.posterId } : {})
		};
	}

	function removeDraft(draft: RoundDraft) {
		drafts = drafts.filter((d) => d !== draft);
		draft.dispose();
	}

	async function saveDraft(draft: RoundDraft, quiet = false): Promise<boolean> {
		if (!draft.isReady(range)) return false;
		draft.saving = true;
		try {
			const media = await mediaArgs(draft);
			await client.mutation(api.rounds.create, {
				gameId: game._id,
				clientId,
				...media,
				...draft.answer()
			});
			removeDraft(draft);
			if (!quiet) toast.success('Runde lagret');
			return true;
		} catch (error) {
			toast.error(errorMessage(error));
			return false;
		} finally {
			draft.saving = false;
		}
	}

	async function saveAllReady() {
		savingAll = true;
		let saved = 0;
		// One at a time, so the rounds keep the order of the cards.
		for (const draft of drafts.filter((d) => d.isReady(range))) {
			if (!(await saveDraft(draft, true))) break;
			saved++;
		}
		savingAll = false;
		if (saved > 0) toast.success(saved === 1 ? 'Runde lagret' : `${saved} runder lagret`);
	}

	function addFiles(files: File[]) {
		const usable = files.filter((file) => isImageFile(file) || isVideoFile(file));
		const skipped = files.length - usable.length;
		if (skipped > 0)
			toast.error(
				skipped === 1
					? `«${files.find((f) => !usable.includes(f))?.name}» er verken et bilde eller en video.`
					: `${skipped} filer er verken bilder eller videoer og ble hoppet over.`
			);
		if (usable.length === 0) return;
		const created = usable.map((file) => {
			const draft = new RoundDraft();
			void draft.loadFile(file, range);
			return draft;
		});
		drafts.push(...created);
		void tick().then(() =>
			document
				.getElementById(created[0].key)
				?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		);
	}

	function reorder(roundIds: Id<'rounds'>[]) {
		void attempt(() =>
			client.mutation(
				api.rounds.reorder,
				{ gameId: game._id, clientId, roundIds },
				{
					optimisticUpdate: (store) =>
						patchDetails(store, (d) => {
							const byId = new Map(d.rounds.map((r) => [r._id, r]));
							const next = roundIds.flatMap((id, order) => {
								const round = byId.get(id);
								return round ? [{ ...round, order }] : [];
							});
							return { ...d, rounds: next };
						})
				}
			)
		);
	}

	// ---------------------------------------------------------------------------
	// Editing and deleting saved rounds
	// ---------------------------------------------------------------------------

	let editDraft = $state.raw<RoundDraft | null>(null);
	let editOpen = $state(false);
	let editNumber = $state(1);

	function openEdit(round: SavedRound) {
		editDraft?.dispose();
		editDraft = new RoundDraft(round);
		editNumber = rounds.findIndex((r) => r._id === round._id) + 1;
		editOpen = true;
	}

	function closeEdit() {
		editOpen = false;
		editDraft?.dispose();
		editDraft = null;
	}

	async function saveEdit() {
		const draft = editDraft;
		if (!draft?.roundId || !draft.isReady(range)) return;
		draft.saving = true;
		try {
			const media = await mediaArgs(draft);
			await client.mutation(api.rounds.update, {
				roundId: draft.roundId,
				clientId,
				...media,
				...draft.answer()
			});
			toast.success('Runde oppdatert');
			if (editDraft === draft) closeEdit();
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			draft.saving = false;
		}
	}

	let deleting = $state.raw<SavedRound | null>(null);
	let deleteOpen = $state(false);
	let deleteBusy = $state(false);
	const deletingNumber = $derived(
		deleting ? rounds.findIndex((r) => r._id === deleting?._id) + 1 : 0
	);

	function askDelete(round: SavedRound) {
		deleting = round;
		deleteOpen = true;
	}

	async function confirmDelete() {
		const round = deleting;
		if (!round) return;
		deleteBusy = true;
		const ok = await attempt(() =>
			client.mutation(
				api.rounds.remove,
				{ roundId: round._id, clientId },
				{
					optimisticUpdate: (store) =>
						patchDetails(store, (d) => ({
							...d,
							rounds: d.rounds
								.filter((r) => r._id !== round._id)
								.map((r, order) => ({ ...r, order }))
						}))
				}
			)
		);
		deleteBusy = false;
		if (ok) {
			deleteOpen = false;
			toast.success('Runde slettet');
		}
	}

	// ---------------------------------------------------------------------------
	// Starting, and not losing drafts by accident
	// ---------------------------------------------------------------------------

	async function startSession() {
		starting = true;
		try {
			const { sessionId } = await client.mutation(api.sessions.create, {
				gameId: game._id,
				clientId
			});
			await goto(resolve('/host/[sessionId]', { sessionId }));
		} catch (error) {
			toast.error(errorMessage(error));
			starting = false;
		}
	}

	let leaveOpen = $state(false);
	let leaveTo: string | null = null;
	let allowLeave = false;

	beforeNavigate(({ cancel, to, type }) => {
		if (allowLeave || drafts.length === 0 || type === 'leave' || !to) return;
		if (to.url.origin !== location.origin) return;
		cancel();
		leaveTo = to.url.pathname + to.url.search + to.url.hash;
		leaveOpen = true;
	});

	function leaveAnyway() {
		allowLeave = true;
		leaveOpen = false;
		// `leaveTo` comes from SvelteKit's own navigation target, so it's already resolved.
		if (leaveTo) void goto(leaveTo);
	}

	const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
</script>

<!-- Files dropped anywhere on the page become new rounds (and never open in the tab). -->
<svelte:window
	ondragover={(event) => {
		if (!hasFiles(event)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = editOpen ? 'none' : 'copy';
	}}
	ondrop={(event) => {
		if (event.defaultPrevented || !hasFiles(event)) return;
		event.preventDefault();
		if (!editOpen) addFiles([...(event.dataTransfer?.files ?? [])]);
	}}
/>

<main class="mx-auto w-full max-w-7xl px-4 pt-2 pb-24 sm:px-6 lg:pt-6">
	<h1 class="sr-only">Rediger spill: {game.title}</h1>

	<div
		class="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
	>
		<div class="flex min-w-0 flex-col gap-10">
			<TitleField
				title={game.title}
				onsave={saveTitle}
				autofocus={rounds.length === 0 && game.title === 'Nytt spill'}
			/>

			<section aria-labelledby="rounds-heading" class="flex flex-col gap-5">
				<div class="flex flex-wrap items-end justify-between gap-3">
					<div class="flex flex-col gap-1">
						<h2 id="rounds-heading" class="text-2xl font-bold tracking-tight">Bilder</h2>
						<p class="text-sm text-muted" data-testid="round-count">
							{#if rounds.length === 0}
								Hvert bilde eller videoklipp blir én runde.
							{:else}
								{countLabel(rounds.length, 'runde', 'runder')} i spillet. Dra for å endre rekkefølgen.
							{/if}
						</p>
					</div>
					{#if rounds.length > 0 || drafts.length > 0}
						<Button variant="secondary" onclick={() => dropInput?.click()}>
							<ImagePlus class="size-5" aria-hidden="true" />
							Legg til bilder
						</Button>
					{/if}
				</div>

				{#if rounds.length > 0}
					<RoundList
						{rounds}
						{settings}
						onreorder={reorder}
						onedit={openEdit}
						ondelete={askDelete}
					/>
				{/if}

				{#if drafts.length > 0}
					<div class="flex flex-col gap-4">
						<div class="flex flex-wrap items-center justify-between gap-3 pt-2">
							<h3 class="text-lg font-bold">
								{countLabel(drafts.length, 'ulagret bilde', 'ulagrede bilder')}
							</h3>
							{#if readyCount > 1}
								<Button
									variant="outline"
									size="sm"
									loading={savingAll}
									data-testid="save-all-rounds"
									onclick={saveAllReady}
								>
									Lagre alle klare ({readyCount})
								</Button>
							{/if}
						</div>
						{#each drafts as draft, index (draft.key)}
							<DraftRoundCard
								{draft}
								number={rounds.length + index + 1}
								{settings}
								{mapStart}
								onsave={() => saveDraft(draft)}
								onremove={() => removeDraft(draft)}
							/>
						{/each}
					</div>
				{/if}

				<MediaDropzone
					bind:input={dropInput}
					onfiles={addFiles}
					compact={rounds.length > 0 || drafts.length > 0}
				/>
			</section>
		</div>

		<aside class="flex flex-col gap-6">
			<Panel
				as="section"
				aria-labelledby="start-heading"
				class="order-last flex flex-col gap-4 lg:order-none"
			>
				<div class="flex flex-col gap-1">
					<h2 id="start-heading" class="text-xl font-bold tracking-tight">Start en økt</h2>
					<p class="text-sm text-muted">
						{#if rounds.length > 0}
							{countLabel(rounds.length, 'runde', 'runder')}. Gjestene blir med fra mobilen med en
							kode.
						{:else}
							Gjestene blir med fra mobilen med en kode.
						{/if}
					</p>
				</div>
				<Button
					size="xl"
					block
					data-testid="start-session"
					disabled={startBlocker !== null}
					loading={starting}
					onclick={startSession}
				>
					<Play class="size-5" aria-hidden="true" />
					Start spill
				</Button>
				{#if startBlocker}
					<p class="text-sm font-medium text-warning" data-testid="start-blocker">
						{startBlocker}
					</p>
				{/if}
				{#if details.activeSession}
					<div class="flex flex-col gap-3 border-t border-line pt-4">
						<p class="text-sm text-muted">
							En økt pågår med koden
							<span class="font-bold tracking-widest text-fg">{details.activeSession.code}</span>.
						</p>
						<Button
							variant="secondary"
							block
							href={resolve('/host/[sessionId]', { sessionId: details.activeSession._id })}
							data-testid="resume-session"
						>
							Fortsett pågående økt
						</Button>
					</div>
				{/if}
			</Panel>

			<SettingsPanel {settings} onsave={saveSettings} />
		</aside>
	</div>
</main>

<Dialog
	bind:open={() => editOpen, (open) => (open ? (editOpen = true) : closeEdit())}
	title="Rediger runde {editNumber}"
	size="lg"
	class="max-w-5xl"
>
	{#if editDraft}
		<div data-testid="edit-round-dialog">
			<RoundEditor draft={editDraft} {settings} {mapStart} onsave={saveEdit}>
				{#snippet secondary()}
					<Button variant="ghost" disabled={editDraft?.saving} onclick={closeEdit}>Avbryt</Button>
				{/snippet}
			</RoundEditor>
		</div>
	{/if}
</Dialog>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Slett runde"
	description={deleting
		? `Runde ${deletingNumber}${deleting.answerLabel ? ` (${deleting.answerLabel}, ${deleting.answerYear})` : ` (${deleting.answerYear})`} slettes for godt.`
		: undefined}
	confirmLabel="Slett runde"
	busy={deleteBusy}
	onconfirm={confirmDelete}
/>

<Dialog
	bind:open={leaveOpen}
	title="Forlate siden?"
	description="{unsavedText}. De forsvinner hvis du går videre."
	size="sm"
>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (leaveOpen = false)}>Bli her</Button>
		<Button variant="danger" onclick={leaveAnyway}>Forlat siden</Button>
	{/snippet}
</Dialog>
