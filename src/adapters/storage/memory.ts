import type { RequestResult } from '../../core/types.js';
import type { StorageAdapter } from './interface.js';

export const createMemoryStorage = (): StorageAdapter => {
	const results: RequestResult[] = [];

	return {
		init: async () => {},
		record: async (result) => {
			results.push(result);
		},
		getAll: async () => [...results],
		close: async () => {},
	};
};
