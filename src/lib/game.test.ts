import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { shuffled } from './game';

describe('shuffled', () => {
	it('always returns a permutation and leaves the input untouched', () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer()),
				fc.double({ min: 0, max: 0.999999, noNaN: true }),
				(items, r) => {
					const copy = [...items];
					const out = shuffled(items, () => r);
					expect(items).toEqual(copy);
					expect([...out].sort((a, b) => a - b)).toEqual([...items].sort((a, b) => a - b));
				}
			)
		);
	});

	it('is deterministic for a given random source', () => {
		const seq = [0.1, 0.9];
		expect(shuffled(['a', 'b', 'c'], () => seq.shift()!)).toEqual(['c', 'b', 'a']);
	});
});
