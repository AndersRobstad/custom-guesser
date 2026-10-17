<script lang="ts">
	import { cn } from './cn';

	/**
	 * The camera date-back imprint: glowing orange seven-segment digits with the
	 * unlit "8" segments faintly visible behind. Used only for time — years and
	 * countdowns — so it stays the one loud thing on screen.
	 */
	let {
		value,
		label,
		size = 'md',
		dim = false,
		animate = false,
		class: className
	}: {
		/** Digits, ':' and '.' are rendered; anything else becomes a blank cell. */
		value: string | number;
		/** Accessible text, e.g. "År 2004". Defaults to the value; '' marks it decorative. */
		label?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl' | 'mega';
		dim?: boolean;
		animate?: boolean;
		class?: string;
	} = $props();

	const text = $derived(String(value).replace(/[^0-9:.-]/g, '!'));
	const ghost = $derived(text.replace(/[0-9!-]/g, '8'));

	const sizes = {
		sm: 'text-lg',
		md: 'text-3xl',
		lg: 'text-5xl',
		xl: 'text-7xl',
		mega: 'text-[clamp(4.5rem,11vw,9rem)]'
	};
</script>

<span
	role={label === '' ? undefined : 'img'}
	aria-label={label === '' ? undefined : (label ?? String(value))}
	aria-hidden={label === '' ? 'true' : undefined}
	class={cn(
		'relative inline-block leading-none font-bold whitespace-pre italic select-none',
		sizes[size],
		className
	)}
	style="font-family: var(--font-stamp)"
>
	<span aria-hidden="true" class="text-stamp-ghost">{ghost}</span>
	<span
		aria-hidden="true"
		class={cn(
			'absolute inset-0 text-stamp transition-opacity',
			dim ? 'opacity-40' : '[text-shadow:0_0_0.35em_var(--glimt-stamp-glow)]',
			animate && 'animate-stamp-in'
		)}>{text}</span
	>
</span>
