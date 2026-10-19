import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 5179);
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E runs against a local Convex backend (`npx convex dev`, see README) and a
 * production build of the app (`vite build` + `vite preview`), i.e. what users
 * actually get. The dev server is avoided on purpose: when it discovers a new
 * dependency it reloads the page mid-test. Both servers are started
 * automatically unless already running (set E2E_PORT to use another port).
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
			command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
			url: baseURL,
			reuseExistingServer: !process.env.CI,
			timeout: 240_000
		}
	]
});
