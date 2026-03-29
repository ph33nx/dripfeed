import { writeFile } from 'node:fs/promises';
import type { SoakStats } from '../../core/types.js';
import type { Reporter } from './interface.js';

const generateMarkdown = (stats: SoakStats): string => {
	const lines: string[] = [
		'# Soak Test Report',
		'',
		'## Summary',
		'',
		`| Metric | Value |`,
		`|--------|-------|`,
		`| Duration | ${stats.duration_s}s |`,
		`| Total Requests | ${stats.total_requests} |`,
		`| Success | ${stats.success_count} |`,
		`| Failures | ${stats.failure_count} |`,
		`| Uptime | ${stats.uptime_pct}% |`,
		'',
		'## Latency',
		'',
		'| Metric | Value |',
		'|--------|-------|',
		`| Min | ${stats.latency.min}ms |`,
		`| Avg | ${stats.latency.avg}ms |`,
		`| P50 | ${stats.latency.p50}ms |`,
		`| P95 | ${stats.latency.p95}ms |`,
		`| P99 | ${stats.latency.p99}ms |`,
		`| Max | ${stats.latency.max}ms |`,
		'',
	];

	if (stats.endpoints.length > 0) {
		lines.push(
			'## Endpoints',
			'',
			'| Endpoint | Requests | Avg | P95 | Errors |',
			'|----------|----------|-----|-----|--------|',
		);
		for (const ep of stats.endpoints) {
			lines.push(
				`| ${ep.name} | ${ep.requests} | ${ep.avg_ms}ms | ${ep.p95_ms}ms | ${ep.error_count} |`,
			);
		}
		lines.push('');
	}

	if (stats.errors.length > 0) {
		lines.push('## Errors', '', '| Endpoint | Status | Count |', '|----------|--------|-------|');
		for (const err of stats.errors) {
			lines.push(`| ${err.endpoint} | ${err.status ?? 'Network'} | ${err.count} |`);
		}
		lines.push('');
	}

	if (stats.thresholds) {
		lines.push(
			'## Thresholds',
			'',
			'| Check | Target | Actual | Result |',
			'|-------|--------|--------|--------|',
		);
		for (const t of stats.thresholds) {
			const icon = t.passed ? 'PASS' : 'FAIL';
			lines.push(`| ${t.name} | ${t.target} | ${t.actual} | ${icon} |`);
		}
		lines.push('');
	}

	return lines.join('\n');
};

export const createMarkdownReporter = (outputPath?: string): Reporter => ({
	onRequest() {},
	onComplete(stats: SoakStats) {
		const md = generateMarkdown(stats);
		if (outputPath) {
			writeFile(outputPath, md).catch((err) => {
				process.stderr.write(
					`[dripfeed] Failed to write report to ${outputPath}: ${err.message}\n`,
				);
			});
		} else {
			process.stdout.write(`${md}\n`);
		}
	},
});
