import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// adapter-auto picks the Vercel adapter automatically when built on Vercel.
			adapter: adapter()
		})
	],
	server: {
		port: Number(process.env.PORT ?? 5173),
		strictPort: !!process.env.PORT
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/lib/**/*.test.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'convex',
					environment: 'edge-runtime',
					include: ['src/convex/**/*.test.ts'],
					server: { deps: { inline: ['convex-test'] } }
				}
			}
		]
	}
});
