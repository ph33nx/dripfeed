import type { DripfeedConfig } from '../../core/types.js';
import type { StorageAdapter } from './interface.js';
import { createJsonStorage } from './json.js';
import { createMemoryStorage } from './memory.js';
import { createSqliteStorage } from './sqlite.js';

export type { StorageAdapter } from './interface.js';
export { createJsonStorage } from './json.js';
export { createMemoryStorage } from './memory.js';
export { createSqliteStorage } from './sqlite.js';

export const createStorage = (config: DripfeedConfig): StorageAdapter => {
	const type = config.storage ?? 'sqlite';
	switch (type) {
		case 'memory':
			return createMemoryStorage();
		case 'json':
			return createJsonStorage(config.db ?? 'dripfeed-results.json');
		case 'sqlite':
			return createSqliteStorage(config.db ?? 'dripfeed-results.db');
	}
};
