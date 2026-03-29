declare module 'bun:sqlite' {
	export class Database {
		constructor(path: string);
		exec(sql: string): void;
		prepare(sql: string): {
			run(...params: unknown[]): void;
			all(...params: unknown[]): Record<string, unknown>[];
		};
		close(): void;
	}
}
