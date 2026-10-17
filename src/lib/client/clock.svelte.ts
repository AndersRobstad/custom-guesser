import { createSubscriber } from 'svelte/reactivity';

/**
 * Server-corrected clock for countdowns. Deadlines come from the server
 * (`roundEndsAt`); the client only counts down visually. Every heartbeat
 * returns the server time, which we use to estimate the clock offset.
 */
class ServerClock {
	offset = $state(0);
	#subscribe = createSubscriber((update) => {
		const id = setInterval(update, 250);
		return () => clearInterval(id);
	});

	/** Reactive "now" in server time; re-evaluates four times a second while read in an effect/template. */
	get now() {
		this.#subscribe();
		return Date.now() + this.offset;
	}

	/** Update the offset from a round-trip: `serverNow` was produced between `sentAt` and `receivedAt`. */
	sync(serverNow: number, sentAt: number, receivedAt: number) {
		const midpoint = sentAt + (receivedAt - sentAt) / 2;
		this.offset = serverNow - midpoint;
	}
}

export const clock = new ServerClock();
