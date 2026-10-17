/**
 * Nominatim's usage policy allows at most one request per second. Every
 * search and reverse lookup from the builder goes through `nominatim()`, which
 * spaces requests out and gives up early if the caller aborts while waiting.
 */
const MIN_GAP_MS = 1100;
let nextSlot = 0;

function sleep(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true }
		);
	});
}

export async function nominatim<T>(request: () => Promise<T>, signal?: AbortSignal): Promise<T> {
	signal?.throwIfAborted();
	const now = Date.now();
	const slot = Math.max(now, nextSlot);
	nextSlot = slot + MIN_GAP_MS;
	if (slot > now) await sleep(slot - now, signal);
	signal?.throwIfAborted();
	return request();
}
