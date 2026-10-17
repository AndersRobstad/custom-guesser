/**
 * Variant recipes for the core components, kept in a plain module so they can
 * be reused (e.g. styling a link like a button) and type-checked by `tsc`.
 */
import { tv, type VariantProps } from 'tailwind-variants';

export const buttonVariants = tv({
	base: [
		'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold',
		'transition-[background-color,color,box-shadow,transform] duration-150 active:translate-y-px',
		'disabled:pointer-events-none disabled:opacity-45'
	],
	variants: {
		variant: {
			primary:
				'bg-primary text-primary-fg shadow-[0_3px_0_0_rgb(0_0_0/0.25)] hover:bg-primary-hover active:shadow-none',
			secondary: 'bg-raised text-fg ring-1 ring-line-strong ring-inset hover:bg-surface',
			ghost: 'text-fg hover:bg-raised',
			outline: 'text-fg ring-1 ring-line-strong ring-inset hover:bg-raised',
			danger: 'bg-danger text-bg hover:brightness-110'
		},
		size: {
			sm: 'h-9 rounded-sm px-3 text-sm',
			md: 'h-11 rounded-md px-5 text-base',
			lg: 'h-14 rounded-md px-7 text-lg',
			xl: 'h-16 rounded-lg px-9 text-xl',
			icon: 'size-11 rounded-md',
			'icon-sm': 'size-9 rounded-sm'
		},
		block: { true: 'w-full' }
	},
	defaultVariants: { variant: 'primary', size: 'md' }
});
export type ButtonVariants = VariantProps<typeof buttonVariants>;

export const inputVariants = tv({
	base: [
		'w-full bg-sunken text-fg ring-1 ring-line-strong ring-inset placeholder:text-subtle',
		'transition-shadow focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-fg',
		'disabled:opacity-50 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger'
	],
	variants: {
		size: {
			md: 'h-11 rounded-md px-3.5 text-base',
			lg: 'h-14 rounded-md px-4 text-lg'
		}
	},
	defaultVariants: { size: 'md' }
});

export const panelVariants = tv({
	base: 'text-fg',
	variants: {
		tone: {
			surface: 'bg-surface ring-1 ring-line ring-inset',
			raised: 'bg-raised ring-1 ring-line ring-inset',
			sunken: 'bg-sunken',
			outline: 'ring-1 ring-line-strong ring-inset'
		},
		padding: { none: '', sm: 'p-3', md: 'p-5', lg: 'p-7' },
		radius: { md: 'rounded-md', lg: 'rounded-lg' }
	},
	defaultVariants: { tone: 'surface', padding: 'md', radius: 'lg' }
});
export type PanelVariants = VariantProps<typeof panelVariants>;
