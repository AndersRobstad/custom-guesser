<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Film from '@lucide/svelte/icons/film';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Timer from '@lucide/svelte/icons/timer';
	import Trash from '@lucide/svelte/icons/trash';
	import { tick } from 'svelte';
	import { Button, DateStamp, cn } from '$lib/ui';
	import type { Id } from '../../convex/_generated/dataModel';
	import { formatSeconds } from './format';
	import type { BuilderSettings, SavedRound } from './types';
	import { formatDuration } from './video';

	/**
	 * Saved rounds in play order. Reorder by dragging (HTML5 drag and drop) or
	 * with the "Flytt opp" / "Flytt ned" buttons; the parent persists the order.
	 */
	let {
		rounds,
		settings,
		onreorder,
		onedit,
		ondelete
	}: {
		rounds: SavedRound[];
		settings: BuilderSettings;
		onreorder: (roundIds: Id<'rounds'>[]) => void;
		onedit: (round: SavedRound) => void;
		ondelete: (round: SavedRound) => void;
	} = $props();

	let dragId = $state<Id<'rounds'> | null>(null);
	/** Live order while dragging; null otherwise. */
	let dragOrder = $state.raw<Id<'rounds'>[] | null>(null);
	let announcement = $state('');
	let list = $state<HTMLOListElement | null>(null);
	/** Video lengths, read from the files' metadata. */
	let durations = $state<Record<string, number>>({});

	const byId = $derived(new Map(rounds.map((round) => [round._id, round])));
	const ordered = $derived(
		dragOrder ? dragOrder.map((id) => byId.get(id)).filter((round) => round !== undefined) : rounds
	);

	function timeLabel(round: SavedRound) {
		if (round.roundSeconds !== null)
			return round.roundSeconds === 0 ? 'Ingen tidsgrense' : formatSeconds(round.roundSeconds);
		return settings.roundSeconds === 0
			? 'Ingen tidsgrense (standard)'
			: `${formatSeconds(settings.roundSeconds)} (standard)`;
	}

	async function move(round: SavedRound, delta: -1 | 1) {
		const ids = rounds.map((r) => r._id);
		const from = ids.indexOf(round._id);
		const to = from + delta;
		if (from < 0 || to < 0 || to >= ids.length) return;
		ids.splice(to, 0, ...ids.splice(from, 1));
		onreorder(ids);
		announcement = `Runde flyttet til plass ${to + 1} av ${ids.length}.`;
		// Keep keyboard focus on the moved round (the DOM node may have moved).
		await tick();
		const item = list?.querySelector(`[data-round-id="${round._id}"]`);
		const preferred = item?.querySelector<HTMLButtonElement>(
			`[data-move="${delta < 0 ? 'up' : 'down'}"]:not(:disabled)`
		);
		const fallback = item?.querySelector<HTMLButtonElement>('[data-move]:not(:disabled)');
		(preferred ?? fallback)?.focus();
	}

	function ondragstart(event: DragEvent, round: SavedRound) {
		dragId = round._id;
		dragOrder = rounds.map((r) => r._id);
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', round._id);
		}
	}

	function ondragover(event: DragEvent, over: SavedRound) {
		if (!dragId || !dragOrder) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		if (over._id === dragId) return;
		const from = dragOrder.indexOf(dragId);
		const to = dragOrder.indexOf(over._id);
		// Only swap once the pointer passes the middle of the row, so it doesn't flicker.
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const middle = rect.top + rect.height / 2;
		if ((to > from && event.clientY < middle) || (to < from && event.clientY > middle)) return;
		const next = [...dragOrder];
		next.splice(from, 1);
		next.splice(to, 0, dragId);
		dragOrder = next;
	}

	function commitDrag(event?: DragEvent) {
		event?.preventDefault();
		if (!dragOrder || !dragId) return;
		const order = dragOrder;
		const moved = dragId;
		dragId = null;
		dragOrder = null;
		if (order.some((id, i) => id !== rounds[i]?._id)) {
			onreorder(order);
			announcement = `Runde flyttet til plass ${order.indexOf(moved) + 1} av ${order.length}.`;
		}
	}

	function ondragend() {
		// Dropped outside the list (or cancelled): put things back.
		dragId = null;
		dragOrder = null;
	}
</script>

<!-- Pointer drag and drop is an enhancement; every move is also possible with the buttons. -->
<ol
	bind:this={list}
	class="flex flex-col gap-2"
	data-testid="round-list"
	ondragover={(event) => {
		if (dragId) event.preventDefault();
	}}
	ondrop={commitDrag}
>
	{#each ordered as round, index (round._id)}
		{@const isVideo = round.mediaType === 'video'}
		{@const duration = durations[round._id]}
		<li
			data-testid="round-item"
			data-round-id={round._id}
			draggable="true"
			ondragstart={(event) => ondragstart(event, round)}
			ondragover={(event) => ondragover(event, round)}
			ondrop={commitDrag}
			{ondragend}
			class={cn(
				'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md bg-surface py-3 pr-3 pl-2 ring-1 ring-line transition-[opacity,box-shadow] ring-inset sm:flex-nowrap',
				dragId === round._id && 'opacity-60 ring-2 ring-fg'
			)}
		>
			<div class="flex items-center gap-1.5">
				<GripVertical class="size-5 shrink-0 cursor-grab text-subtle" aria-hidden="true" />
				<span class="w-7 text-right text-xl font-black text-muted tabular" aria-hidden="true">
					{index + 1}
				</span>
			</div>

			<div
				class="relative shrink-0 rounded-print bg-fg p-1 shadow-[0_6px_16px_-8px_rgb(0_0_0/0.6)]"
			>
				{#if round.imageUrl}
					<img
						src={round.imageUrl}
						alt=""
						class="h-14 w-20 bg-sunken object-cover"
						draggable="false"
						loading="lazy"
					/>
				{:else}
					<div class="h-14 w-20 bg-sunken"></div>
				{/if}
				{#if isVideo}
					<span
						class="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-sm bg-bg/85 px-1 py-0.5 text-[11px] leading-none font-bold text-fg"
					>
						<Film class="size-3" aria-hidden="true" />
						Video
					</span>
					{#if round.videoUrl}
						<video
							src={round.videoUrl}
							preload="metadata"
							muted
							class="hidden"
							aria-hidden="true"
							bind:duration={durations[round._id]}
						></video>
					{/if}
				{/if}
			</div>

			<div class="flex min-w-0 flex-1 flex-col gap-1.5">
				<div class="flex min-w-0 items-center gap-3">
					<DateStamp value={round.answerYear} label="År {round.answerYear}" size="sm" />
					<p class="line-clamp-2 font-semibold break-words sm:line-clamp-1">
						<span class="sr-only">Runde {index + 1}:</span>
						{round.answerLabel ?? 'Uten stedsnavn'}
					</p>
				</div>
				<p class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
					<span class="flex items-center gap-1">
						<Timer class="size-3.5" aria-hidden="true" />
						{timeLabel(round)}
					</span>
					{#if isVideo}
						<span class="flex items-center gap-1">
							<Film class="size-3.5" aria-hidden="true" />
							Video{duration && Number.isFinite(duration) ? ` · ${formatDuration(duration)}` : ''}
						</span>
					{/if}
					{#if round.caption}
						<span class="min-w-0 truncate">{round.caption}</span>
					{/if}
				</p>
			</div>

			<div class="ml-auto flex shrink-0 items-center gap-0.5">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Flytt opp"
					title="Flytt opp"
					data-move="up"
					data-testid="round-move-up"
					disabled={index === 0 || dragId !== null}
					onclick={() => move(round, -1)}
				>
					<ArrowUp class="size-4" aria-hidden="true" />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Flytt ned"
					title="Flytt ned"
					data-move="down"
					data-testid="round-move-down"
					disabled={index === ordered.length - 1 || dragId !== null}
					onclick={() => move(round, 1)}
				>
					<ArrowDown class="size-4" aria-hidden="true" />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Rediger"
					title="Rediger"
					data-testid="round-edit"
					onclick={() => onedit(round)}
				>
					<Pencil class="size-4" aria-hidden="true" />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Slett"
					title="Slett"
					class="hover:text-danger"
					data-testid="round-delete"
					onclick={() => ondelete(round)}
				>
					<Trash class="size-4" aria-hidden="true" />
				</Button>
			</div>
		</li>
	{/each}
</ol>
<p class="sr-only" aria-live="polite">{announcement}</p>
