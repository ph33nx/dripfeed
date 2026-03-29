import type { RequestResult } from '../../core/types.js';

export interface StorageAdapter {
	init(): Promise<void>;
	record(result: RequestResult): Promise<void>;
	getAll(): Promise<RequestResult[]>;
	close(): Promise<void>;
}
