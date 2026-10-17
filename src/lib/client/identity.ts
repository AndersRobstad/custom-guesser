const KEY = 'glimt:clientId';
let memoryId: string | null = null;

function uuid() {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
	});
}

/**
 * Anonymous identity for this browser. Stored in localStorage so a refresh or
 * reconnect gets the same player/host back. Falls back to memory if storage is blocked.
 */
export function getClientId(): string {
	try {
		const existing = localStorage.getItem(KEY);
		if (existing) return existing;
		const id = uuid();
		localStorage.setItem(KEY, id);
		return id;
	} catch {
		memoryId ??= uuid();
		return memoryId;
	}
}

const NAME_KEY = 'glimt:lastName';

export function rememberName(name: string) {
	try {
		localStorage.setItem(NAME_KEY, name);
	} catch {
		// Not important if this fails.
	}
}

export function lastName(): string {
	try {
		return localStorage.getItem(NAME_KEY) ?? '';
	} catch {
		return '';
	}
}
