import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Reporter } from '../../src/adapters/reporters/interface.js';
import type { ParsedConfig } from '../../src/core/config.js';
import { createSoakTest } from '../../src/core/runner.js';
import type { RequestResult } from '../../src/core/types.js';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
	server = http.createServer((req, res) => {
		if (req.url === '/ok') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok' }));
		} else if (req.url === '/slow') {
			setTimeout(() => {
				res.writeHead(200);
				res.end('slow');
			}, 200);
		} else if (req.url === '/error') {
			res.writeHead(500);
			res.end('Internal Server Error');
		} else {
			res.writeHead(404);
			res.end('Not Found');
		}
	});

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const addr = server.address() as AddressInfo;
	baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => {
		server.close(() => resolve());
	});
});

const makeConfig = (overrides: Partial<ParsedConfig> = {}): ParsedConfig => ({
	interval: '100ms',
	timeout: '5s',
	storage: 'memory',
	rotation: 'round-robin',
	keepAlive: true,
	followRedirects: true,
	insecure: false,
	endpoints: [{ name: 'ok', url: `${baseUrl}/ok`, method: 'GET', weight: 1 }],
	...overrides,
});

describe('createSoakTest', () => {
	it('runs a timed soak test and returns stats', async () => {
		const config = makeConfig({ duration: '500ms' });
		const collected: RequestResult[] = [];

		const reporter: Reporter = {
			onRequest(result) {
				collected.push(result);
			},
			onComplete() {},
		};

		const test = createSoakTest(config, [reporter]);
		const stats = await test.run();

		expect(stats.total_requests).toBeGreaterThan(0);
		expect(stats.success_count).toBeGreaterThan(0);
		expect(stats.failure_count).toBe(0);
		expect(stats.uptime_pct).toBe(100);
		expect(collected.length).toBeGreaterThan(0);
	});

	it('records errors for failing endpoints', async () => {
		const config = makeConfig({
			duration: '300ms',
			endpoints: [{ name: 'error', url: `${baseUrl}/error`, method: 'GET', weight: 1 }],
		});

		const test = createSoakTest(config, []);
		const stats = await test.run();

		expect(stats.failure_count).toBeGreaterThan(0);
		expect(stats.errors.length).toBeGreaterThan(0);
		expect(stats.errors[0]?.status).toBe(500);
	});

	it('rotates through endpoints with round-robin', async () => {
		const config = makeConfig({
			duration: '500ms',
			rotation: 'round-robin',
			endpoints: [
				{ name: 'ok', url: `${baseUrl}/ok`, method: 'GET', weight: 1 },
				{ name: 'slow', url: `${baseUrl}/slow`, method: 'GET', weight: 1 },
			],
		});

		const endpointNames: string[] = [];
		const reporter: Reporter = {
			onRequest(result) {
				endpointNames.push(result.endpoint);
			},
			onComplete() {},
		};

		const test = createSoakTest(config, [reporter]);
		await test.run();

		// Should alternate between ok and slow
		const hasOk = endpointNames.includes('ok');
		const hasSlow = endpointNames.includes('slow');
		expect(hasOk).toBe(true);
		expect(hasSlow).toBe(true);
	});

	it('can be started and stopped manually', async () => {
		const config = makeConfig();
		const test = createSoakTest(config, []);

		await test.start();
		// Let a few ticks happen
		await new Promise((r) => setTimeout(r, 350));
		const stats = await test.stop();

		expect(stats.total_requests).toBeGreaterThan(0);
	});

	it('evaluates thresholds and includes them in stats', async () => {
		const config = makeConfig({
			duration: '300ms',
			thresholds: {
				error_rate: '< 1%',
				p95: '< 5000ms',
			},
		});

		const test = createSoakTest(config, []);
		const stats = await test.run();

		expect(stats.thresholds).toBeDefined();
		expect(stats.thresholds?.length).toBe(2);
		expect(stats.thresholds?.every((t) => t.passed)).toBe(true);
	});
});
