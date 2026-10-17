<script lang="ts">
	import '../app.css';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex } from 'convex-svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/ui';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	setupConvex(PUBLIC_CONVEX_URL);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Glimt</title>
</svelte:head>

{@render children()}
<Toaster />
