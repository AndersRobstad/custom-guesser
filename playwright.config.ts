import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 5179);
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E runs against a local Convex backend (`npx convex dev --local`, see README)
 * and the SvelteKit dev server. Both are started automatically unless already running.
 */
export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 240_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: [
		{
			command: 'npx convex dev --tail-logs disable',
			url: 'http://127.0.0.1:3210/version',
			reuseExistingServer: true,
			timeout: 180_000,
			stdout: 'ignore'
		},
		{
			command: `npx vite dev --port ${PORT} --strictPort`,
			url: baseURL,
			reuseExistingServer: true,
			timeout: 120_000
		}
	]
});
