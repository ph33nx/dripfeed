import type { Reporter } from '../adapters/reporters/interface.js';
import { createStorage } from '../adapters/storage/index.js';
import { parseDuration } from '../utils/duration.js';
import { timedFetch } from '../utils/http.js';
import { computeStats } from '../utils/stats.js';
import type { ParsedConfig } from './config.js';
import {
	type DripfeedConfig,
	type EndpointConfig,
	isSuccess,
	type RequestResult,
	type SoakStats,
	type SoakTestHandle,
} from './types.js';

type PickEndpoint = (endpoints: EndpointConfig[]) => EndpointConfig;

const createWeightedRandom = (): PickEndpoint => {
	return (endpoints) => {
		const totalWeight = endpoints.reduce((sum, ep) => sum + (ep.weight ?? 1), 0);
		let rand = Math.random() * totalWeight;
		for (const ep of endpoints) {
			rand -= ep.weight ?? 1;
			if (rand <= 0) return ep;
		}
		// Unreachable when endpoints is non-empty (validated by Zod min(1)),
		// but satisfies TS without non-null assertion
		return endpoints[endpoints.length - 1] as EndpointConfig;
	};
};

const createRoundRobin = (): PickEndpoint => {
	let idx = -1;
	return (endpoints) => {
		idx = (idx + 1) % endpoints.length;
		return endpoints[idx] as EndpointConfig;
	};
};

const createPicker = (rotation: string): PickEndpoint => {
	switch (rotation) {
		case 'round-robin':
		case 'sequential':
			return createRoundRobin();
		default:
			return createWeightedRandom();
	}
};

// Safely coerce ParsedConfig endpoints to EndpointConfig[]
const toEndpoints = (config: ParsedConfig): EndpointConfig[] =>
	config.endpoints.map((ep) => ({
		name: ep.name,
		url: ep.url,
		method: ep.method,
		headers: ep.headers as Record<string, string> | undefined,
		body: ep.body,
		timeout: ep.timeout,
		weight: ep.weight,
	}));

export const createSoakTest = (
	config: ParsedConfig,
	reporters: Reporter[] = [],
): SoakTestHandle => {
	const storage = createStorage(config as unknown as DripfeedConfig);
	const endpoints = toEndpoints(config);
	const globalHeaders = config.headers as Record<string, string> | undefined;
	const pick = createPicker(config.rotation);
	const intervalMs = Math.max(100, parseDuration(config.interval));
	let timer: ReturnType<typeof setInterval> | null = null;
	let startTime: Date | null = null;
	let okCount = 0;
	let failCount = 0;
	let running = false;

	const tick = async () => {
		if (!running) return;
		const endpoint = pick(endpoints);
		const result: RequestResult = await timedFetch(endpoint, globalHeaders, config.timeout);
		if (!running) return;
		await storage.record(result);

		isSuccess(result.status) ? okCount++ : failCount++;

		for (const reporter of reporters) {
			reporter.onRequest(result, { ok: okCount, fail: failCount });
		}
	};

	const getStats = async (): Promise<SoakStats> => {
		const results = await storage.getAll();
		return computeStats(results, startTime ?? new Date(), config.thresholds);
	};

	const safeTick = () => {
		tick().catch((err) => {
			process.stderr.write(`[dripfeed] tick error: ${err instanceof Error ? err.message : err}\n`);
		});
	};

	const start = async () => {
		if (running) return;
		running = true;
		await storage.init();
		startTime = new Date();
		safeTick();
		timer = setInterval(safeTick, intervalMs);
	};

	const stop = async (): Promise<SoakStats> => {
		running = false;
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		const stats = await getStats();
		for (const reporter of reporters) {
			reporter.onComplete(stats);
		}
		await storage.close();
		return stats;
	};

	const run = async (opts?: { duration?: string }): Promise<SoakStats> => {
		const durationStr = opts?.duration ?? config.duration;
		await start();

		if (durationStr) {
			const durationMs = parseDuration(durationStr);
			await new Promise<void>((resolve) => {
				setTimeout(() => resolve(), durationMs);
			});
		} else {
			await new Promise<void>((resolve) => {
				const handler = () => {
					process.removeListener('SIGINT', handler);
					process.removeListener('SIGTERM', handler);
					resolve();
				};
				process.on('SIGINT', handler);
				process.on('SIGTERM', handler);
			});
		}

		return stop();
	};

	return { start, stop, run };
};
