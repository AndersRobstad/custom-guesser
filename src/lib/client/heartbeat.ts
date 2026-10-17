import { HEARTBEAT_INTERVAL_MS } from '$lib/game';
import { clock } from './clock.svelte';

/**
 * Calls `beat` now and every 15 s (and when the tab becomes visible again),
 * syncing the server clock from its result. Returns a cleanup function.
 */
export function startHeartbeat(beat: () => Promise<{ serverNow: number }>): () => void {
	let stopped = false;

	async function tick() {
		if (stopped) return;
		const sentAt = Date.now();
		try {
			const { serverNow } = await beat();
			clock.sync(serverNow, sentAt, Date.now());
		} catch {
			// Transient network errors are fine; the next beat will retry.
		}
	}

	const onVisible = () => {
		if (document.visibilityState === 'visible') void tick();
	};

	void tick();
	const id = setInterval(tick, HEARTBEAT_INTERVAL_MS);
	document.addEventListener('visibilitychange', onVisible);
	return () => {
		stopped = true;
		clearInterval(id);
		document.removeEventListener('visibilitychange', onVisible);
	};
}
