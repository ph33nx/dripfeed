import type { EndpointConfig, RequestResult } from '../core/types.js';
import { parseDuration } from './duration.js';

export const timedFetch = async (
	endpoint: EndpointConfig,
	globalHeaders?: Record<string, string>,
	timeout = '30s',
): Promise<RequestResult> => {
	const timeoutMs = parseDuration(endpoint.timeout ?? timeout);
	const headers = { ...globalHeaders, ...endpoint.headers };
	const method = endpoint.method ?? 'GET';
	const url = endpoint.url;
	const start = performance.now();

	try {
		const response = await fetch(url, {
			method,
			headers,
			body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
			signal: AbortSignal.timeout(timeoutMs),
			redirect: 'follow',
		});

		const durationMs = Math.round(performance.now() - start);
		const isError = response.status >= 400;
		const body = isError ? await response.text().catch(() => null) : null;

		return {
			timestamp: new Date().toISOString(),
			endpoint: endpoint.name,
			method,
			url,
			status: response.status,
			duration_ms: durationMs,
			response_body: body,
			error: null,
		};
	} catch (err) {
		const durationMs = Math.round(performance.now() - start);
		const message = err instanceof Error ? err.message : String(err);

		return {
			timestamp: new Date().toISOString(),
			endpoint: endpoint.name,
			method,
			url,
			status: null,
			duration_ms: durationMs,
			response_body: null,
			error: message,
		};
	}
};
