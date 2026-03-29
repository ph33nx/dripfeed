import type { RequestResult, SoakStats } from '../../core/types.js';

export interface Reporter {
	onRequest(result: RequestResult, counts: { ok: number; fail: number }): void;
	onComplete(stats: SoakStats): void;
}
