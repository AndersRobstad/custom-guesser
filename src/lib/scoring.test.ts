import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_K_YEAR,
	MAX_SCORE,
	PRESETS,
	YEAR_STRICTNESS,
	haversineKm,
	locationScore,
	presetScoring,
	scoreGuess,
	yearScore,
	yearStrictnessFor,
	type PresetKey
} from './scoring';

const OSLO = { lat: 59.9139, lng: 10.7522 };
const BERGEN = { lat: 60.3913, lng: 5.3221 };

describe('haversineKm', () => {
	it('Oslo → Bergen is about 305 km', () => {
		expect(Math.abs(haversineKm(OSLO.lat, OSLO.lng, BERGEN.lat, BERGEN.lng) - 305)).toBeLessThan(2);
	});

	it('same point is 0', () => {
		expect(haversineKm(OSLO.lat, OSLO.lng, OSLO.lat, OSLO.lng)).toBe(0);
	});

	it('antipodes are about 20 015 km apart', () => {
		expect(Math.abs(haversineKm(0, 0, 0, 180) - 20015)).toBeLessThan(1);
		expect(Math.abs(haversineKm(90, 0, -90, 0) - 20015)).toBeLessThan(1);
		expect(
			Math.abs(haversineKm(OSLO.lat, OSLO.lng, -OSLO.lat, OSLO.lng - 180) - 20015)
		).toBeLessThan(1);
	});

	it('is symmetric', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -90, max: 90, noNaN: true }),
				fc.double({ min: -180, max: 180, noNaN: true }),
				fc.double({ min: -90, max: 90, noNaN: true }),
				fc.double({ min: -180, max: 180, noNaN: true }),
				(a, b, c, d) => {
					expect(haversineKm(a, b, c, d)).toBeCloseTo(haversineKm(c, d, a, b), 6);
				}
			)
		);
	});
});

describe('locationScore', () => {
	const europe = presetScoring('europe');

	it('gives 5000 at d = 0 and anywhere inside the perfect radius', () => {
		for (const key of Object.keys(PRESETS) as PresetKey[]) {
			const p = presetScoring(key);
			expect(locationScore(0, p)).toBe(MAX_SCORE);
			expect(locationScore(p.perfectKm, p)).toBe(MAX_SCORE);
			expect(locationScore(p.perfectKm / 2, p)).toBe(MAX_SCORE);
		}
	});

	it('is never negative and never above 5000', () => {
		fc.assert(
			fc.property(
				fc.double({ min: -100, max: 1e6, noNaN: true }),
				fc.double({ min: 0, max: 100, noNaN: true }),
				fc.double({ min: 0, max: 10000, noNaN: true }),
				(d, perfectKm, kKm) => {
					const s = locationScore(d, { perfectKm, kKm });
					expect(s).toBeGreaterThanOrEqual(0);
					expect(s).toBeLessThanOrEqual(MAX_SCORE);
					expect(Number.isInteger(s)).toBe(true);
				}
			)
		);
	});

	it('never rewards a larger distance with more points (monotone)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 25000, noNaN: true }),
				fc.double({ min: 0, max: 25000, noNaN: true }),
				fc.constantFrom(...(Object.keys(PRESETS) as PresetKey[])),
				(a, b, key) => {
					const [near, far] = a <= b ? [a, b] : [b, a];
					const p = presetScoring(key);
					expect(locationScore(far, p)).toBeLessThanOrEqual(locationScore(near, p));
				}
			)
		);
	});

	it('handles a zero decay constant as a hard cut-off', () => {
		expect(locationScore(0.5, { perfectKm: 1, kKm: 0 })).toBe(MAX_SCORE);
		expect(locationScore(2, { perfectKm: 1, kKm: 0 })).toBe(0);
	});

	it('Europe preset: 50 km miss gives 4570', () => {
		expect(locationScore(50, europe)).toBe(4570);
	});
});

describe('preset table from the spec', () => {
	const table: Record<PresetKey, { perfectKm: number; kKm: number; at50: number; at500: number }> =
		{
			city: { perfectKm: 0.05, kKm: 3, at50: 0, at500: 0 },
			// Added after the spec (between By and Norge): one region of the country.
			region: { perfectKm: 0.5, kKm: 30, at50: 960, at500: 0 },
			norway: { perfectKm: 1, kKm: 100, at50: 3063, at500: 34 },
			europe: { perfectKm: 5, kKm: 500, at50: 4570, at500: 1858 },
			world: { perfectKm: 25, kKm: 2000, at50: 4938, at500: 3943 }
		};

	for (const [key, row] of Object.entries(table) as [PresetKey, (typeof table)[PresetKey]][]) {
		it(`${PRESETS[key].label}: parameters and 50/500 km scores match exactly`, () => {
			expect(PRESETS[key].perfectKm).toBe(row.perfectKm);
			expect(PRESETS[key].kKm).toBe(row.kKm);
			expect(locationScore(50, PRESETS[key])).toBe(row.at50);
			expect(locationScore(500, PRESETS[key])).toBe(row.at500);
		});
	}
});

describe('yearScore', () => {
	const params = { kYear: DEFAULT_K_YEAR };

	it('uses k = 4 by default', () => {
		expect(DEFAULT_K_YEAR).toBe(4);
	});

	it('reproduces the table: 0→5000, 1→3894, 2→3033, 5→1433, 10→410', () => {
		expect(yearScore(0, params)).toBe(5000);
		expect(yearScore(1, params)).toBe(3894);
		expect(yearScore(2, params)).toBe(3033);
		expect(yearScore(5, params)).toBe(1433);
		expect(yearScore(10, params)).toBe(410);
	});

	it('treats over- and undershooting the same', () => {
		expect(yearScore(-3, params)).toBe(yearScore(3, params));
	});

	it('is bounded and monotone in the year difference', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 500 }),
				fc.integer({ min: 0, max: 500 }),
				fc.double({ min: 0.1, max: 50, noNaN: true }),
				(a, b, kYear) => {
					const [near, far] = a <= b ? [a, b] : [b, a];
					const sNear = yearScore(near, { kYear });
					const sFar = yearScore(far, { kYear });
					expect(sFar).toBeLessThanOrEqual(sNear);
					for (const s of [sNear, sFar]) {
						expect(s).toBeGreaterThanOrEqual(0);
						expect(s).toBeLessThanOrEqual(MAX_SCORE);
					}
				}
			)
		);
	});
});

describe('year strictness levels', () => {
	it('maps Snill/Normal/Streng to kYear 8/4/2 with the expected penalties', () => {
		expect(YEAR_STRICTNESS.lenient.kYear).toBe(8);
		expect(YEAR_STRICTNESS.normal.kYear).toBe(DEFAULT_K_YEAR);
		expect(YEAR_STRICTNESS.strict.kYear).toBe(2);
		expect(yearScore(1, YEAR_STRICTNESS.lenient)).toBe(4412);
		expect(yearScore(1, YEAR_STRICTNESS.strict)).toBe(3033);
		expect(yearScore(2, YEAR_STRICTNESS.strict)).toBe(1839);
		expect(yearScore(5, YEAR_STRICTNESS.strict)).toBe(410);
	});

	it('recognises the named levels and treats other values as custom', () => {
		expect(yearStrictnessFor(2)).toBe('strict');
		expect(yearStrictnessFor(4)).toBe('normal');
		expect(yearStrictnessFor(8)).toBe('lenient');
		expect(yearStrictnessFor(3)).toBeNull();
	});
});

describe('Landsdel preset', () => {
	it('sits between By and Norge', () => {
		const region = presetScoring('region');
		expect(locationScore(10, region)).toBe(3643);
		expect(locationScore(25, region)).toBe(2210);
		expect(locationScore(100, region)).toBe(181);
		expect(locationScore(10, region)).toBeLessThan(locationScore(10, presetScoring('norway')));
		expect(locationScore(10, region)).toBeGreaterThan(locationScore(10, presetScoring('city')));
	});
});

describe('scoreGuess', () => {
	it('combines location and year into a round total of max 10 000', () => {
		const perfect = scoreGuess(
			{ ...OSLO, year: 2010 },
			{ ...OSLO, year: 2010 },
			presetScoring('norway')
		);
		expect(perfect).toMatchObject({ distanceKm: 0, yearDiff: 0, total: 10000 });

		const miss = scoreGuess(
			{ ...BERGEN, year: 2012 },
			{ ...OSLO, year: 2010 },
			presetScoring('norway')
		);
		expect(miss.yearDiff).toBe(2);
		expect(miss.yearScore).toBe(3033);
		expect(miss.total).toBe(miss.locationScore + miss.yearScore);
		expect(miss.total).toBeLessThan(10000);
	});
});
