export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
	id: number;
	message: string;
	tone: ToastTone;
}

class Toaster {
	items = $state<Toast[]>([]);
	#next = 1;

	show(message: string, tone: ToastTone = 'info', durationMs = 4000) {
		const id = this.#next++;
		this.items.push({ id, message, tone });
		setTimeout(() => this.dismiss(id), durationMs);
		return id;
	}

	success = (message: string) => this.show(message, 'success');
	error = (message: string) => this.show(message, 'error', 6000);

	dismiss(id: number) {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

/** App-wide toasts (the app is client-rendered, so a module singleton is safe). */
export const toast = new Toaster();
