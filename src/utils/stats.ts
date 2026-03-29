import {
	type EndpointStats,
	type ErrorGroup,
	isSuccess,
	type LatencyStats,
	type RequestResult,
	type SoakStats,
	type ThresholdConfig,
	type ThresholdResult,
} from '../core/types.js';
import { parseDuration } from './duration.js';

export const percentile = (sorted: number[], p: number): number => {
	if (sorted.length === 0) return 0;
	const idx = (p / 100) * (sorted.length - 1);
	const lower = Math.floor(idx);
	const upper = Math.ceil(idx);
	const lowerVal = sorted[lower] ?? 0;
	const upperVal = sorted[upper] ?? 0;
	if (lower === upper) return lowerVal;
	return lowerVal + (upperVal - lowerVal) * (idx - lower);
};

const computeLatency = (durations: number[]): LatencyStats => {
	if (durations.length === 0) {
		return { min: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
	}
	const sorted = [...durations].sort((a, b) => a - b);
	const sum = sorted.reduce((a, b) => a + b, 0);
	return {
		min: sorted[0] ?? 0,
		avg: Math.round(sum / sorted.length),
		p50: Math.round(percentile(sorted, 50)),
		p95: Math.round(percentile(sorted, 95)),
		p99: Math.round(percentile(sorted, 99)),
		max: sorted.at(-1) ?? 0,
	};
};

const computeEndpointStats = (results: RequestResult[]): EndpointStats[] => {
	const byEndpoint = new Map<string, RequestResult[]>();
	for (const r of results) {
		const list = byEndpoint.get(r.endpoint) ?? [];
		list.push(r);
		byEndpoint.set(r.endpoint, list);
	}

	return [...byEndpoint.entries()].map(([name, items]) => {
		const durations = items.map((r) => r.duration_ms);
		const sorted = [...durations].sort((a, b) => a - b);
		const sum = durations.reduce((a, b) => a + b, 0);
		return {
			name,
			requests: items.length,
			avg_ms: Math.round(sum / items.length),
			p95_ms: Math.round(percentile(sorted, 95)),
			error_count: items.filter((r) => !isSuccess(r.status)).length,
		};
	});
};

const computeErrors = (results: RequestResult[]): ErrorGroup[] => {
	const key = (r: RequestResult) => `${r.endpoint}:${r.status}`;
	const groups = new Map<string, ErrorGroup>();

	for (const r of results) {
		if (isSuccess(r.status)) continue;
		const k = key(r);
		const existing = groups.get(k);
		if (existing) {
			existing.count++;
		} else {
			groups.set(k, {
				endpoint: r.endpoint,
				status: r.status,
				count: 1,
				sample_body: r.response_body,
			});
		}
	}

	return [...groups.values()].sort((a, b) => b.count - a.count);
};

const parseThresholdValue = (s: string): number => {
	const cleaned = s.replace(/[<>=%\s]/g, '');
	if (cleaned.endsWith('ms')) return Number.parseFloat(cleaned);
	if (cleaned.endsWith('s')) return Number.parseFloat(cleaned) * 1000;
	return Number.parseFloat(cleaned);
};

const evaluateThresholds = (
	thresholds: ThresholdConfig,
	latency: LatencyStats,
	errorRate: number,
): ThresholdResult[] => {
	const results: ThresholdResult[] = [];

	if (thresholds.error_rate) {
		const target = parseThresholdValue(thresholds.error_rate);
		results.push({
			name: 'error_rate',
			target: thresholds.error_rate,
			actual: `${errorRate.toFixed(2)}%`,
			passed: errorRate < target,
		});
	}

	const latencyChecks: Array<[keyof ThresholdConfig, keyof LatencyStats]> = [
		['p50', 'p50'],
		['p95', 'p95'],
		['p99', 'p99'],
		['max', 'max'],
	];

	for (const [configKey, statKey] of latencyChecks) {
		const threshold = thresholds[configKey];
		if (!threshold) continue;
		const targetMs = parseDuration(threshold.replace(/[<>\s]/g, ''));
		results.push({
			name: configKey,
			target: threshold,
			actual: `${latency[statKey]}ms`,
			passed: latency[statKey] < targetMs,
		});
	}

	return results;
};

export const computeStats = (
	results: RequestResult[],
	startTime: Date,
	thresholds?: ThresholdConfig,
	endTime?: Date,
): SoakStats => {
	const end = endTime ?? new Date();
	const durationS = Math.round((end.getTime() - startTime.getTime()) / 1000);
	const durations = results.map((r) => r.duration_ms);
	const latency = computeLatency(durations);

	const successCount = results.filter((r) => isSuccess(r.status)).length;
	const failureCount = results.length - successCount;
	const uptimePct = results.length > 0 ? (successCount / results.length) * 100 : 100;

	const statusCodes: Record<number, number> = {};
	for (const r of results) {
		if (r.status !== null) {
			statusCodes[r.status] = (statusCodes[r.status] ?? 0) + 1;
		}
	}

	const errorRate = results.length > 0 ? (failureCount / results.length) * 100 : 0;

	return {
		duration_s: durationS,
		total_requests: results.length,
		success_count: successCount,
		failure_count: failureCount,
		uptime_pct: Math.round(uptimePct * 100) / 100,
		latency,
		status_codes: statusCodes,
		endpoints: computeEndpointStats(results),
		errors: computeErrors(results),
		thresholds: thresholds ? evaluateThresholds(thresholds, latency, errorRate) : undefined,
	};
};
