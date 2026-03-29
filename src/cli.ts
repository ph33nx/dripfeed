#!/usr/bin/env node
import { createRequire } from 'node:module';
import { defineCommand, runMain } from 'citty';
import { createConsoleReporter } from './adapters/reporters/console.js';
import type { Reporter } from './adapters/reporters/interface.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

import { createJsonReporter } from './adapters/reporters/json.js';
import { createMarkdownReporter } from './adapters/reporters/markdown.js';
import { createSqliteStorage } from './adapters/storage/sqlite.js';
import { loadDripfeedConfig, type ParsedConfig } from './core/config.js';
import { createSoakTest } from './core/runner.js';
import { computeStats } from './utils/stats.js';

const VALID_REPORT_FORMATS = ['console', 'json', 'markdown'] as const;
const VALID_EXPORT_FORMATS = ['csv', 'json'] as const;

const validateFormat = (format: string, valid: readonly string[], command: string) => {
	if (!valid.includes(format)) {
		process.stderr.write(
			`Unsupported format "${format}" for ${command}. Use: ${valid.join(', ')}\n`,
		);
		process.exit(1);
	}
};

const run = defineCommand({
	meta: { name: 'run', description: 'Start a soak test' },
	args: {
		duration: { type: 'string', alias: 'd', description: 'Test duration (e.g. "30s", "5m", "2h")' },
		interval: { type: 'string', alias: 'i', description: 'Request interval (e.g. "3s", "500ms")' },
		db: { type: 'string', description: 'SQLite database path' },
		report: {
			type: 'string',
			alias: 'r',
			description: 'Report format: console, json, markdown',
			default: 'console',
		},
		output: { type: 'string', alias: 'o', description: 'Report output file path' },
		quiet: { type: 'boolean', alias: 'q', description: 'Suppress live output', default: false },
	},
	run: async ({ args }) => {
		const reportFormat = args.report ?? 'console';
		validateFormat(reportFormat, VALID_REPORT_FORMATS, 'report');

		const overrides: Record<string, unknown> = {};
		if (args.duration) overrides.duration = args.duration;
		if (args.interval) overrides.interval = args.interval;
		if (args.db) overrides.db = args.db;

		let config: ParsedConfig | undefined;
		try {
			config = await loadDripfeedConfig(overrides);
		} catch (err) {
			if (err && typeof err === 'object' && 'issues' in err) {
				process.stderr.write('Invalid config. Run `dripfeed init` to create a starter config.\n');
				const { issues } = err as { issues: unknown };
				process.stderr.write(`Details: ${JSON.stringify(issues, null, 2)}\n`);
			} else {
				process.stderr.write(`Config error: ${err instanceof Error ? err.message : err}\n`);
			}
			process.exit(1);
		}

		const reporters: Reporter[] = [];
		// Auto-quiet when using json/markdown report to avoid mixing outputs
		const shouldQuiet = args.quiet || reportFormat !== 'console';
		if (!shouldQuiet) {
			reporters.push(createConsoleReporter());
		}

		if (reportFormat === 'json') {
			reporters.push(createJsonReporter(args.output));
		} else if (reportFormat === 'markdown') {
			reporters.push(createMarkdownReporter(args.output));
		}

		// Startup banner (only in console mode)
		if (!shouldQuiet) {
			const interval = config.interval ?? '3s';
			const duration = args.duration ? ` for ${args.duration}` : '';
			process.stdout.write(
				`\ndripfeed v${version} | every ${interval}${duration} | Ctrl+C to stop\n\n`,
			);
		}

		const test = createSoakTest(config, reporters);
		const stats = await test.run({ duration: args.duration });

		if (stats.thresholds?.some((t) => !t.passed)) {
			process.exit(1);
		}
	},
});

const init = defineCommand({
	meta: { name: 'init', description: 'Generate a starter dripfeed config file' },
	args: {
		format: {
			type: 'string',
			description: 'Config format: ts, json',
			default: 'ts',
		},
	},
	run: async ({ args }) => {
		const { writeFile, access } = await import('node:fs/promises');
		const format = args.format ?? 'ts';

		if (format !== 'ts' && format !== 'json') {
			process.stderr.write(`Unsupported format "${format}". Use: ts, json\n`);
			process.exit(1);
		}

		const filename = format === 'ts' ? 'dripfeed.config.ts' : 'dripfeed.config.json';

		// Check if file exists
		try {
			await access(filename);
			process.stderr.write(
				`${filename} already exists. Delete it first or use a different format.\n`,
			);
			process.exit(1);
		} catch {
			// File doesn't exist, proceed
		}

		if (format === 'ts') {
			const content = `import type { DripfeedConfig } from 'dripfeed';

const config: DripfeedConfig = {
\tinterval: '3s',
\ttimeout: '30s',
\tstorage: 'sqlite',
\trotation: 'weighted-random',
\tendpoints: [
\t\t{
\t\t\tname: 'health',
\t\t\turl: 'https://api.example.com/health',
\t\t},
\t\t{
\t\t\tname: 'users',
\t\t\turl: 'https://api.example.com/v1/users',
\t\t\tweight: 3,
\t\t},
\t],
\tthresholds: {
\t\terror_rate: '< 1%',
\t\tp95: '< 500ms',
\t},
};

export default config;
`;
			await writeFile(filename, content);
		} else {
			const content = {
				interval: '3s',
				timeout: '30s',
				storage: 'sqlite',
				rotation: 'weighted-random',
				endpoints: [
					{ name: 'health', url: 'https://api.example.com/health' },
					{ name: 'users', url: 'https://api.example.com/v1/users', weight: 3 },
				],
				thresholds: { error_rate: '< 1%', p95: '< 500ms' },
			};
			await writeFile(filename, JSON.stringify(content, null, 2));
		}

		process.stdout.write(`Created ${filename}\n`);
	},
});

const report = defineCommand({
	meta: { name: 'report', description: 'Generate a report from an existing SQLite database' },
	args: {
		db: {
			type: 'string',
			description: 'SQLite database path',
			default: 'dripfeed-results.db',
		},
		format: {
			type: 'string',
			description: 'Report format: console, json, markdown',
			default: 'console',
		},
		output: { type: 'string', alias: 'o', description: 'Output file path' },
	},
	run: async ({ args }) => {
		const format = args.format ?? 'console';
		validateFormat(format, VALID_REPORT_FORMATS, 'report');

		const dbPath = args.db ?? 'dripfeed-results.db';
		const storage = createSqliteStorage(dbPath);
		await storage.init();
		const results = await storage.getAll();
		await storage.close();

		if (results.length === 0) {
			process.stdout.write('No results found in database.\n');
			return;
		}

		// Use first result timestamp as start, last as end for accurate duration
		const firstTimestamp = new Date(results[0]?.timestamp ?? Date.now());
		const lastTimestamp = new Date(results[results.length - 1]?.timestamp ?? Date.now());
		const stats = computeStats(results, firstTimestamp, undefined, lastTimestamp);

		if (format === 'console') {
			createConsoleReporter().onComplete(stats);
		} else if (format === 'json') {
			createJsonReporter(args.output).onComplete(stats);
		} else if (format === 'markdown') {
			createMarkdownReporter(args.output).onComplete(stats);
		}

		if (args.output) {
			process.stdout.write(`Report written to ${args.output}\n`);
		}
	},
});

const exportCmd = defineCommand({
	meta: { name: 'export', description: 'Export results from SQLite to CSV or JSON' },
	args: {
		db: {
			type: 'string',
			description: 'SQLite database path',
			default: 'dripfeed-results.db',
		},
		format: { type: 'string', description: 'Export format: csv, json', default: 'csv' },
		output: { type: 'string', alias: 'o', description: 'Output file path' },
	},
	run: async ({ args }) => {
		const format = args.format ?? 'csv';
		validateFormat(format, VALID_EXPORT_FORMATS, 'export');

		const { writeFile } = await import('node:fs/promises');
		const dbPath = args.db ?? 'dripfeed-results.db';
		const storage = createSqliteStorage(dbPath);
		await storage.init();
		const results = await storage.getAll();
		await storage.close();

		let output: string;

		if (format === 'json') {
			output = JSON.stringify(results, null, 2);
		} else {
			const headers = [
				'timestamp',
				'endpoint',
				'method',
				'url',
				'status',
				'duration_ms',
				'error',
				'response_body',
			];
			const escapeCsv = (s: string | null) => {
				if (s === null) return '';
				return s.includes(',') || s.includes('"') || s.includes('\n')
					? `"${s.replace(/"/g, '""')}"`
					: s;
			};
			const rows = results.map((r) =>
				[
					r.timestamp,
					r.endpoint,
					r.method,
					r.url,
					r.status ?? '',
					r.duration_ms,
					escapeCsv(r.error),
					escapeCsv(r.response_body),
				].join(','),
			);
			output = [headers.join(','), ...rows].join('\n');
		}

		if (args.output) {
			await writeFile(args.output, output);
			process.stdout.write(`Exported ${results.length} results to ${args.output}\n`);
		} else {
			process.stdout.write(`${output}\n`);
		}
	},
});

const main = defineCommand({
	meta: {
		name: 'dripfeed',
		version,
		description: 'Soak test CLI for APIs. Hits endpoints at intervals, logs results to SQLite.',
	},
	subCommands: { run, init, report, export: exportCmd },
});

runMain(main);
