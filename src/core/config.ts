import { loadConfig } from 'c12';
import { z } from 'zod';

const endpointSchema = z.object({
	name: z.string(),
	url: z.string().url(),
	method: z.string().default('GET'),
	headers: z.record(z.string(), z.string()).optional(),
	body: z.unknown().optional(),
	timeout: z.string().optional(),
	weight: z.number().positive().default(1),
});

const thresholdSchema = z.object({
	error_rate: z.string().optional(),
	p50: z.string().optional(),
	p95: z.string().optional(),
	p99: z.string().optional(),
	max: z.string().optional(),
});

export const configSchema = z.object({
	interval: z.string().default('3s'),
	duration: z.string().optional(),
	timeout: z.string().default('30s'),
	storage: z.enum(['sqlite', 'json', 'memory']).default('sqlite'),
	db: z.string().optional(),
	rotation: z.enum(['weighted-random', 'round-robin', 'sequential']).default('weighted-random'),
	headers: z.record(z.string(), z.string()).optional(),
	endpoints: z.array(endpointSchema).min(1, 'At least one endpoint is required'),
	thresholds: thresholdSchema.optional(),
});

export type ParsedConfig = z.infer<typeof configSchema>;

/** Parse and validate a raw config object into a fully-typed ParsedConfig with defaults applied.
 *  Use this when creating a soak test programmatically without a config file. */
export const parseConfig = (raw: unknown): ParsedConfig => configSchema.parse(raw);

const interpolateEnv = (value: unknown): unknown => {
	if (typeof value === 'string') {
		return value.replace(/\$\{(\w+)\}/g, (_, key: string) => {
			const val = process.env[key];
			if (val === undefined) {
				process.stderr.write(`[dripfeed] Warning: environment variable "${key}" is not set\n`);
			}
			return val ?? '';
		});
	}
	if (Array.isArray(value)) return value.map(interpolateEnv);
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolateEnv(v)]));
	}
	return value;
};

export const loadDripfeedConfig = async (
	overrides?: Partial<ParsedConfig>,
): Promise<ParsedConfig> => {
	const { config } = await loadConfig({ name: 'dripfeed' });
	const merged = { ...config, ...overrides };
	const interpolated = interpolateEnv(merged);
	return configSchema.parse(interpolated);
};
