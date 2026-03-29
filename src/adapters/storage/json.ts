import { readFile, writeFile } from 'node:fs/promises';
import type { RequestResult } from '../../core/types.js';
import type { StorageAdapter } from './interface.js';

const FLUSH_INTERVAL = 10;

export const createJsonStorage = (filePath: string): StorageAdapter => {
	let buffer: RequestResult[] = [];
	let flushed: RequestResult[] = [];

	const flush = async () => {
		if (buffer.length === 0) return;
		flushed = [...flushed, ...buffer];
		buffer = [];
		await writeFile(filePath, JSON.stringify(flushed, null, 2));
	};

	return {
		init: async () => {
			try {
				const data = await readFile(filePath, 'utf-8');
				flushed = JSON.parse(data);
			} catch {
				flushed = [];
			}
		},
		record: async (result) => {
			buffer.push(result);
			if (buffer.length >= FLUSH_INTERVAL) await flush();
		},
		getAll: async () => [...flushed, ...buffer],
		close: async () => {
			await flush();
		},
	};
};
