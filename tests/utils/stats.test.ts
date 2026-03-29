import { describe, expect, it } from 'vitest';
import type { RequestResult } from '../../src/core/types.js';
import { computeStats, percentile } from '../../src/utils/stats.js';

describe('percentile', () => {
	it('returns 0 for empty array', () => {
		expect(percentile([], 50)).toBe(0);
	});

	it('returns the only value for single-element array', () => {
		expect(percentile([42], 50)).toBe(42);
		expect(percentile([42], 99)).toBe(42);
	});

	it('computes p50 correctly', () => {
		const sorted = [10, 20, 30, 40, 50];
		expect(percentile(sorted, 50)).toBe(30);
	});

	it('computes p95 with interpolation', () => {
		const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
		expect(percentile(sorted, 95)).toBeCloseTo(95.05, 1);
	});

	it('computes p99', () => {
		const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
		expect(percentile(sorted, 99)).toBeCloseTo(99.01, 1);
	});
});

const makeResult = (overrides: Partial<RequestResult> = {}): RequestResult => ({
	timestamp: new Date().toISOString(),
	endpoint: 'test',
	method: 'GET',
	url: 'https://example.com',
	status: 200,
	duration_ms: 100,
	response_body: null,
	error: null,
	...overrides,
});

describe('computeStats', () => {
	it('computes basic stats for successful requests', () => {
		const results = [
			makeResult({ duration_ms: 50 }),
			makeResult({ duration_ms: 100 }),
			makeResult({ duration_ms: 150 }),
		];
		const start = new Date(Date.now() - 10_000);
		const stats = computeStats(results, start);

		expect(stats.total_requests).toBe(3);
		expect(stats.success_count).toBe(3);
		expect(stats.failure_count).toBe(0);
		expect(stats.uptime_pct).toBe(100);
		expect(stats.latency.min).toBe(50);
		expect(stats.latency.max).toBe(150);
		expect(stats.latency.avg).toBe(100);
	});

	it('tracks failures correctly', () => {
		const results = [
			makeResult({ status: 200, duration_ms: 50 }),
			makeResult({ status: 500, duration_ms: 100 }),
			makeResult({ status: null, error: 'timeout', duration_ms: 30000 }),
		];
		const stats = computeStats(results, new Date(Date.now() - 5000));

		expect(stats.success_count).toBe(1);
		expect(stats.failure_count).toBe(2);
		expect(stats.uptime_pct).toBeCloseTo(33.33, 1);
		expect(stats.errors).toHaveLength(2);
	});

	it('groups errors by endpoint and status', () => {
		const results = [
			makeResult({ endpoint: 'api', status: 500, response_body: 'error1' }),
			makeResult({ endpoint: 'api', status: 500, response_body: 'error2' }),
			makeResult({ endpoint: 'health', status: 503 }),
		];
		const stats = computeStats(results, new Date());

		expect(stats.errors).toHaveLength(2);
		const apiErrors = stats.errors.find((e) => e.endpoint === 'api');
		expect(apiErrors?.count).toBe(2);
		expect(apiErrors?.status).toBe(500);
	});

	it('computes per-endpoint stats', () => {
		const results = [
			makeResult({ endpoint: 'api', duration_ms: 100 }),
			makeResult({ endpoint: 'api', duration_ms: 200 }),
			makeResult({ endpoint: 'health', duration_ms: 50 }),
		];
		const stats = computeStats(results, new Date());

		expect(stats.endpoints).toHaveLength(2);
		const api = stats.endpoints.find((e) => e.name === 'api');
		expect(api?.requests).toBe(2);
		expect(api?.avg_ms).toBe(150);
	});

	it('evaluates thresholds', () => {
		const results = [
			makeResult({ duration_ms: 100 }),
			makeResult({ duration_ms: 200 }),
			makeResult({ status: 500, duration_ms: 300 }),
		];
		const stats = computeStats(results, new Date(), {
			error_rate: '< 50%',
			p95: '< 500ms',
		});

		expect(stats.thresholds).toHaveLength(2);
		const errorRate = stats.thresholds?.find((t) => t.name === 'error_rate');
		expect(errorRate?.passed).toBe(true);
		const p95 = stats.thresholds?.find((t) => t.name === 'p95');
		expect(p95?.passed).toBe(true);
	});

	it('fails thresholds when exceeded', () => {
		const results = Array.from({ length: 10 }, (_, i) =>
			makeResult({ status: i < 5 ? 200 : 500, duration_ms: 1000 }),
		);
		const stats = computeStats(results, new Date(), {
			error_rate: '< 10%',
			p95: '< 100ms',
		});

		const errorRate = stats.thresholds?.find((t) => t.name === 'error_rate');
		expect(errorRate?.passed).toBe(false);
		const p95 = stats.thresholds?.find((t) => t.name === 'p95');
		expect(p95?.passed).toBe(false);
	});

	it('returns valid stats for empty results', () => {
		const stats = computeStats([], new Date());
		expect(stats.total_requests).toBe(0);
		expect(stats.uptime_pct).toBe(100);
		expect(stats.latency.min).toBe(0);
	});
});
