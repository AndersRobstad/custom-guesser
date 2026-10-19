const KEY = 'glimt:videoSound';

function read(): boolean {
	try {
		return localStorage.getItem(KEY) !== 'off';
	} catch {
		return true;
	}
}

/**
 * Whether the host wants video sound on the TV. Remembered across rounds (and
 * reloads), so muting once keeps the rest of the game quiet and vice versa.
 */
class SoundPreference {
	on = $state(read());

	set(on: boolean) {
		this.on = on;
		try {
			localStorage.setItem(KEY, on ? 'on' : 'off');
		} catch {
			// Not important if this fails.
		}
	}
}

export const soundPreference = new SoundPreference();
