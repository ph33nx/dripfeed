import { writeFile } from 'node:fs/promises';
import type { SoakStats } from '../../core/types.js';
import type { Reporter } from './interface.js';

export const createJsonReporter = (outputPath?: string): Reporter => ({
	onRequest() {},
	onComplete(stats: SoakStats) {
		const json = JSON.stringify(stats, null, 2);
		if (outputPath) {
			writeFile(outputPath, json).catch((err) => {
				process.stderr.write(
					`[dripfeed] Failed to write report to ${outputPath}: ${err.message}\n`,
				);
			});
		} else {
			process.stdout.write(`${json}\n`);
		}
	},
});
