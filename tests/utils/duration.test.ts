import { describe, expect, it } from 'vitest';
import { parseDuration } from '../../src/utils/duration.js';

describe('parseDuration', () => {
	it('parses milliseconds', () => {
		expect(parseDuration('500ms')).toBe(500);
		expect(parseDuration('0ms')).toBe(0);
	});

	it('parses seconds', () => {
		expect(parseDuration('3s')).toBe(3_000);
		expect(parseDuration('1s')).toBe(1_000);
		expect(parseDuration('0.5s')).toBe(500);
	});

	it('parses minutes', () => {
		expect(parseDuration('10m')).toBe(600_000);
		expect(parseDuration('1m')).toBe(60_000);
	});

	it('parses hours', () => {
		expect(parseDuration('2h')).toBe(7_200_000);
		expect(parseDuration('24h')).toBe(86_400_000);
	});

	it('parses days', () => {
		expect(parseDuration('1d')).toBe(86_400_000);
	});

	it('handles whitespace', () => {
		expect(parseDuration(' 3s ')).toBe(3_000);
	});

	it('throws on invalid input', () => {
		expect(() => parseDuration('abc')).toThrow('Invalid duration');
		expect(() => parseDuration('3')).toThrow('Invalid duration');
		expect(() => parseDuration('')).toThrow('Invalid duration');
		expect(() => parseDuration('3x')).toThrow('Invalid duration');
	});
});
