export interface RequestResult {
	timestamp: string;
	endpoint: string;
	method: string;
	url: string;
	status: number | null;
	duration_ms: number;
	response_body: string | null;
	error: string | null;
}

export interface EndpointConfig {
	name: string;
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: unknown;
	timeout?: string;
	weight?: number;
}

export interface ThresholdConfig {
	error_rate?: string;
	p50?: string;
	p95?: string;
	p99?: string;
	max?: string;
}

export interface DripfeedConfig {
	interval?: string;
	duration?: string;
	timeout?: string;
	storage?: 'sqlite' | 'json' | 'memory';
	db?: string;
	rotation?: 'weighted-random' | 'round-robin' | 'sequential';
	headers?: Record<string, string>;
	endpoints: EndpointConfig[];
	thresholds?: ThresholdConfig;
}

/** Check if an HTTP status code represents a successful response */
export const isSuccess = (status: number | null): boolean =>
	status !== null && status >= 200 && status < 400;

export interface EndpointStats {
	name: string;
	requests: number;
	avg_ms: number;
	p95_ms: number;
	error_count: number;
}

export interface ErrorGroup {
	endpoint: string;
	status: number | null;
	count: number;
	sample_body: string | null;
}

export interface ThresholdResult {
	name: string;
	target: string;
	actual: string;
	passed: boolean;
}

export interface LatencyStats {
	min: number;
	avg: number;
	p50: number;
	p95: number;
	p99: number;
	max: number;
}

export interface SoakStats {
	duration_s: number;
	total_requests: number;
	success_count: number;
	failure_count: number;
	uptime_pct: number;
	latency: LatencyStats;
	status_codes: Record<number, number>;
	endpoints: EndpointStats[];
	errors: ErrorGroup[];
	thresholds?: ThresholdResult[];
}

export interface SoakTestHandle {
	start: () => Promise<void>;
	stop: () => Promise<SoakStats>;
	run: (opts?: { duration?: string }) => Promise<SoakStats>;
}
