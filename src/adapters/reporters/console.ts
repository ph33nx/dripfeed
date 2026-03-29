import { isSuccess, type RequestResult, type SoakStats } from '../../core/types.js';
import type { Reporter } from './interface.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

const pad = (s: string, len: number) => s.padEnd(len);
const rpad = (s: string, len: number) => s.padStart(len);

export const createConsoleReporter = (): Reporter => {
	let requestNum = 0;

	return {
		onRequest(result: RequestResult, counts: { ok: number; fail: number }) {
			requestNum++;
			const ok = isSuccess(result.status);
			const icon = ok ? `${GREEN}\u2713${RESET}` : `${RED}\u2717${RESET}`;
			const num = rpad(`#${requestNum}`, 6);
			const name = pad(result.endpoint, 24);
			const status = result.status
				? ok
					? `${GREEN}${result.status}${RESET}`
					: `${RED}${result.status}${RESET}`
				: `${RED}ERR${RESET}`;
			const duration = rpad(`${result.duration_ms}ms`, 8);
			const total = counts.ok + counts.fail;
			const pct = total > 0 ? ((counts.ok / total) * 100).toFixed(1) : '100.0';
			const summary = `${DIM}ok:${counts.ok} fail:${counts.fail} (${pct}%)${RESET}`;

			process.stdout.write(`${icon} ${num} ${name} ${status} ${duration} | ${summary}\n`);

			if (!ok && result.error) {
				process.stdout.write(`  ${DIM}${result.error}${RESET}\n`);
			}
		},

		onComplete(stats: SoakStats) {
			const divider = `${DIM}${'─'.repeat(70)}${RESET}`;
			process.stdout.write(`\n${divider}\n`);
			process.stdout.write(`${BOLD}Soak Test Summary${RESET}\n`);
			process.stdout.write(`${divider}\n\n`);

			process.stdout.write(`  Duration:    ${stats.duration_s}s\n`);
			process.stdout.write(`  Requests:    ${stats.total_requests}\n`);
			process.stdout.write(
				`  Success:     ${GREEN}${stats.success_count}${RESET}  Failures: ${stats.failure_count > 0 ? RED : ''}${stats.failure_count}${RESET}\n`,
			);
			process.stdout.write(`  Uptime:      ${stats.uptime_pct}%\n\n`);

			process.stdout.write(`  ${CYAN}Latency${RESET}\n`);
			process.stdout.write(`  min: ${stats.latency.min}ms  avg: ${stats.latency.avg}ms  `);
			process.stdout.write(`p50: ${stats.latency.p50}ms  p95: ${stats.latency.p95}ms  `);
			process.stdout.write(`p99: ${stats.latency.p99}ms  max: ${stats.latency.max}ms\n\n`);

			if (stats.endpoints.length > 0) {
				process.stdout.write(`  ${CYAN}Endpoints${RESET}\n`);
				for (const ep of stats.endpoints) {
					const errPart = ep.error_count > 0 ? `  ${RED}${ep.error_count} errors${RESET}` : '';
					process.stdout.write(
						`  ${pad(ep.name, 24)} ${rpad(String(ep.requests), 5)} reqs  avg: ${rpad(String(ep.avg_ms), 5)}ms  p95: ${rpad(String(ep.p95_ms), 5)}ms${errPart}\n`,
					);
				}
				process.stdout.write('\n');
			}

			if (stats.errors.length > 0) {
				process.stdout.write(`  ${RED}Errors${RESET}\n`);
				for (const err of stats.errors.slice(0, 10)) {
					const status = err.status ?? 'NET';
					process.stdout.write(
						`  ${pad(err.endpoint, 24)} ${YELLOW}${status}${RESET} x${err.count}\n`,
					);
				}
				process.stdout.write('\n');
			}

			if (stats.thresholds) {
				process.stdout.write(`  ${CYAN}Thresholds${RESET}\n`);
				for (const t of stats.thresholds) {
					const icon = t.passed ? `${GREEN}\u2713${RESET}` : `${RED}\u2717${RESET}`;
					process.stdout.write(
						`  ${icon} ${pad(t.name, 12)} target: ${pad(t.target, 12)} actual: ${t.actual}\n`,
					);
				}
				const allPassed = stats.thresholds.every((t) => t.passed);
				if (!allPassed) {
					process.stdout.write(`\n  ${RED}${BOLD}THRESHOLDS FAILED${RESET}\n`);
				}
				process.stdout.write('\n');
			}
		},
	};
};
