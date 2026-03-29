import type { RequestResult } from '../../core/types.js';
import { isBun } from '../../utils/runtime.js';
import type { StorageAdapter } from './interface.js';

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS results (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	timestamp TEXT NOT NULL,
	endpoint TEXT NOT NULL,
	method TEXT NOT NULL,
	url TEXT NOT NULL,
	status INTEGER,
	duration_ms REAL NOT NULL,
	response_body TEXT,
	error TEXT
)`;

const INSERT = `
INSERT INTO results (timestamp, endpoint, method, url, status, duration_ms, response_body, error)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

// Unified interface for both bun:sqlite and better-sqlite3
interface SqliteDb {
	exec(sql: string): void;
	prepare(sql: string): SqliteStatement;
	close(): void;
}

interface SqliteStatement {
	run(...params: unknown[]): void;
	all(...params: unknown[]): Record<string, unknown>[];
}

const openBunSqlite = async (path: string): Promise<SqliteDb> => {
	const { Database } = await import('bun:sqlite');
	const db = new Database(path);
	db.exec('PRAGMA journal_mode = WAL');
	return {
		exec: (sql) => db.exec(sql),
		prepare: (sql) => {
			const stmt = db.prepare(sql);
			return {
				run: (...params) => stmt.run(...params),
				all: (...params) => stmt.all(...params) as Record<string, unknown>[],
			};
		},
		close: () => db.close(),
	};
};

const openBetterSqlite = async (path: string): Promise<SqliteDb> => {
	let mod: { default: (path: string) => SqliteDb };
	try {
		mod = await import('better-sqlite3' as string);
	} catch {
		throw new Error(
			'SQLite storage requires "better-sqlite3" on Node.js. Install it:\n  npm install better-sqlite3\nOr use storage: "json" in your dripfeed config.',
		);
	}
	const db = mod.default(path);
	db.exec('PRAGMA journal_mode = WAL');
	return {
		exec: (sql: string) => db.exec(sql),
		prepare: (sql: string) => {
			const stmt = db.prepare(sql);
			return {
				run: (...params: unknown[]) => stmt.run(...params),
				all: (...params: unknown[]) => stmt.all(...params) as Record<string, unknown>[],
			};
		},
		close: () => db.close(),
	};
};

export const createSqliteStorage = (dbPath: string): StorageAdapter => {
	let db: SqliteDb | null = null;
	let insertStmt: SqliteStatement | null = null;

	return {
		init: async () => {
			db = isBun ? await openBunSqlite(dbPath) : await openBetterSqlite(dbPath);
			db.exec(CREATE_TABLE);
			insertStmt = db.prepare(INSERT);
		},
		record: async (result) => {
			insertStmt?.run(
				result.timestamp,
				result.endpoint,
				result.method,
				result.url,
				result.status,
				result.duration_ms,
				result.response_body,
				result.error,
			);
		},
		getAll: async () => {
			const rows = db?.prepare('SELECT * FROM results ORDER BY id').all() ?? [];
			return rows.map(
				(row) =>
					({
						timestamp: row.timestamp as string,
						endpoint: row.endpoint as string,
						method: row.method as string,
						url: row.url as string,
						status: row.status as number | null,
						duration_ms: row.duration_ms as number,
						response_body: row.response_body as string | null,
						error: row.error as string | null,
					}) satisfies RequestResult,
			);
		},
		close: async () => {
			db?.close();
		},
	};
};
