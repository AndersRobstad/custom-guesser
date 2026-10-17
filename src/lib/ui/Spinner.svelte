<script lang="ts">
	import { cn } from './cn';

	let { class: className, label = 'Laster' }: { class?: string; label?: string } = $props();
</script>

<span
	role="status"
	aria-label={label}
	class={cn(
		'inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent',
		className
	)}
></span>
