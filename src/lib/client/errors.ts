import { ConvexError } from 'convex/values';

/** Turns a thrown error into a short Norwegian message for the UI. */
export function errorMessage(error: unknown, fallback = 'Noe gikk galt. Prøv igjen.'): string {
	if (error instanceof ConvexError && typeof error.data === 'string') return error.data;
	if (error instanceof Error && /network|fetch|connection/i.test(error.message))
		return 'Mistet forbindelsen. Sjekk nettet og prøv igjen.';
	return fallback;
}
