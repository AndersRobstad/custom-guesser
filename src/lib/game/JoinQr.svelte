<script lang="ts">
	import QRCode from 'qrcode';
	import { cn } from '$lib/ui';

	let { url, class: className }: { url: string; class?: string } = $props();

	/** One SVG path with a 1×1 square per dark module, rendered natively (no {@html}). */
	const qr = $derived.by(() => {
		const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
		let d = '';
		for (let y = 0; y < modules.size; y++) {
			for (let x = 0; x < modules.size; x++) {
				if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
			}
		}
		return { size: modules.size, d };
	});
</script>

<div class={cn('aspect-square rounded-md bg-fg p-3', className)} data-testid="join-qr">
	<svg
		viewBox="0 0 {qr.size} {qr.size}"
		class="h-full w-full"
		shape-rendering="crispEdges"
		role="img"
		aria-label="QR-kode for å bli med"
	>
		<path d={qr.d} fill="var(--glimt-bg)" />
	</svg>
</div>
