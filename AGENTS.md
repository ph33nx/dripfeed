# dripfeed

Soak test (endurance test) CLI and library. Sends HTTP requests to your endpoints at intervals for hours or days, logs every response to SQLite, reports latency percentiles and uptime, fails CI on threshold breaches.

> Read the full method reference and config options below before writing any code.

## Install

```bash
npm install dripfeed
# Node.js SQLite users also need:
npm install better-sqlite3
```

On Bun, no extra dependencies needed (native TS config loading and bun:sqlite).

## CLI commands

```bash
dripfeed init                           # Generate starter config (dripfeed.config.ts)
dripfeed init --format json             # Generate JSON config instead
dripfeed run                            # Run indefinitely (Ctrl+C to stop)
dripfeed run --duration 10m             # Run for 10 minutes
dripfeed run --duration 2h --quiet      # Suppress live output
dripfeed run --report json              # Output JSON summary (auto-suppresses console)
dripfeed run --report markdown -o r.md  # Write markdown report to file
dripfeed report --db results.db         # Generate report from existing database
dripfeed report --format json           # Report as JSON
dripfeed export --format csv -o out.csv # Export raw results as CSV
dripfeed export --format json           # Export as JSON
```

Short aliases: `-d` (duration), `-i` (interval), `-r` (report), `-o` (output), `-q` (quiet).

Note: `report` and `export` commands only read SQLite databases. They do not work with JSON or memory storage.

## Config file

Auto-discovered as `dripfeed.config.{ts,js,json,yaml,toml}`, `.dripfeedrc`, or `.config/dripfeed.*`.

```typescript
import type { DripfeedConfig } from 'dripfeed';

const config: DripfeedConfig = {
  interval: '3s',          // Time between requests (min 100ms)
  timeout: '30s',          // Per-request timeout
  storage: 'sqlite',       // sqlite | json | memory
  db: 'results.db',        // SQLite file path (default: dripfeed-results.db)
  rotation: 'weighted-random', // weighted-random | round-robin | sequential
  headers: {               // Global headers for all requests
    Authorization: 'Bearer ${API_TOKEN}',  // ${VAR} interpolated from process.env
  },
  endpoints: [
    {
      name: 'health',
      url: 'https://api.example.com/health',
    },
    {
      name: 'create-order',
      url: 'https://api.example.com/v1/orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { product_id: 'sku-123', quantity: 1 },
      weight: 3,           // 3x more likely to be selected
    },
  ],
  thresholds: {
    error_rate: '< 1%',
    p95: '< 500ms',
    p99: '< 2000ms',
  },
};

export default config;
```

### Config options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `interval` | string | `"3s"` | Time between requests. Formats: 500ms, 1s, 3s, 30s, 1m |
| `timeout` | string | `"30s"` | Request timeout |
| `storage` | string | `"sqlite"` | Storage: sqlite, json, memory |
| `db` | string | `"dripfeed-results.db"` | SQLite/JSON file path |
| `rotation` | string | `"weighted-random"` | Endpoint selection strategy |
| `headers` | object | `{}` | Global headers applied to all requests |
| `endpoints` | array | required | At least one endpoint with name and url |
| `thresholds` | object | none | Pass/fail criteria for CI |

### Endpoint options

| Option | Type | Default |
|--------|------|---------|
| `name` | string | required |
| `url` | string | required |
| `method` | string | GET |
| `headers` | object | {} |
| `body` | any | none |
| `timeout` | string | global |
| `weight` | number | 1 |

## Library API

```typescript
import {
  createSoakTest,
  parseConfig,
  createConsoleReporter,
  createJsonReporter,
  createMarkdownReporter,
  createMemoryStorage,
} from 'dripfeed';
```

### parseConfig(raw)

Validates a raw config object, applies Zod defaults, returns `ParsedConfig`. Always use this before `createSoakTest`.

```typescript
const config = parseConfig({
  interval: '3s',
  storage: 'memory',
  endpoints: [{ name: 'health', url: 'https://api.example.com/health' }],
  thresholds: { error_rate: '< 1%', p95: '< 500ms' },
});
```

### createSoakTest(config, reporters)

Returns `{ start(), stop(), run({ duration }) }`.

```typescript
const test = createSoakTest(config, [createConsoleReporter()]);

// Fixed duration (returns stats when done)
const stats = await test.run({ duration: '10m' });

// Or manual start/stop
await test.start();
// ... later
const stats = await test.stop();
```

### Return type: SoakStats

```typescript
interface SoakStats {
  duration_s: number;
  total_requests: number;
  success_count: number;
  failure_count: number;
  uptime_pct: number;
  latency: { min: number; avg: number; p50: number; p95: number; p99: number; max: number };
  status_codes: Record<number, number>;
  endpoints: Array<{ name: string; requests: number; avg_ms: number; p95_ms: number; error_count: number }>;
  errors: Array<{ endpoint: string; status: number | null; count: number; sample_body: string | null }>;
  thresholds?: Array<{ name: string; target: string; actual: string; passed: boolean }>;
}
```

### Reporters

- `createConsoleReporter()` - ANSI colored live output
- `createJsonReporter(outputPath?)` - JSON summary to file or stdout
- `createMarkdownReporter(outputPath?)` - Markdown report to file or stdout

### Utilities

- `parseDuration('3s')` - parse human duration to milliseconds
- `isSuccess(status)` - true for status 100-399
- `percentile(sorted, p)` - compute percentile from sorted array
- `computeStats(results, startTime, thresholds?)` - compute SoakStats from RequestResult array
- `timedFetch(endpoint, globalHeaders?, timeout?)` - single timed request, returns RequestResult
- `isBun` / `isNode` / `isDeno` - runtime detection booleans

## Behavior notes

- Success = status 100-399 (includes redirects)
- Error response bodies captured on status >= 400 or null (timeout/network)
- SQLite database appends across runs. Delete the .db file for fresh results
- Exit code 1 when any threshold fails
- `${VAR}` in config strings interpolated from process.env
- Minimum interval enforced at 100ms
- Bun auto-detects bun:sqlite. Node.js requires better-sqlite3 for SQLite storage.

## Common tasks

| Task | Code |
|------|------|
| Quick 10m soak test | `npx dripfeed run -d 10m` |
| CI pipeline test | `npx dripfeed run -d 5m -q` (exit code 1 on failure) |
| JSON report to file | `npx dripfeed run -d 10m -r json -o report.json` |
| Programmatic test | `parseConfig({...})` then `createSoakTest(config).run({duration: '5m'})` |
| Query failures | `sqlite3 dripfeed-results.db "SELECT * FROM results WHERE status >= 400"` |
| Serverless/tests | Use `storage: 'memory'` (no file system needed) |
