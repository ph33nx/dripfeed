# dripfeed

Soak test your API. One request every few seconds, for hours. Logs every failure.

[![npm version](https://img.shields.io/npm/v/dripfeed)](https://www.npmjs.com/package/dripfeed)
[![npm downloads](https://img.shields.io/npm/dm/dripfeed)](https://www.npmjs.com/package/dripfeed)
[![CI](https://img.shields.io/github/actions/workflow/status/ph33nx/dripfeed/ci.yml?branch=main&label=CI)](https://github.com/ph33nx/dripfeed/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dripfeed)](https://github.com/ph33nx/dripfeed/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.0-black)](https://bun.sh)

**dripfeed** sends HTTP requests to your endpoints at regular intervals (every 1 to 30 seconds) and logs every response to a local SQLite database. Run it for hours or days to catch intermittent failures, latency degradation, memory leaks, resource exhaustion, and silent outages that load tests and uptime pings miss.

This is **soak testing** (also called endurance testing): sustained, low-volume traffic over extended periods to evaluate stability and reliability. It surfaces problems that only appear under real-world conditions, like performance degradation over time, connection pool exhaustion, and errors that happen once every thousand requests.

## When to use dripfeed

| Scenario | Tool |
|----------|------|
| "Can my server handle 10,000 concurrent users?" | k6, artillery, vegeta |
| "Is my API up right now?" | Uptime Kuma, Better Stack, Pingdom |
| "Did my API silently degrade overnight?" | **dripfeed** |
| "Does my API return errors under sustained real-world usage?" | **dripfeed** |
| "I need a queryable history of every API response for the last 24 hours" | **dripfeed** |

## Why dripfeed?

- **Zero infrastructure.** No Docker, no Grafana, no InfluxDB. One CLI command, one SQLite file
- **SQLite-first.** Every request logged to a queryable database. `SELECT * FROM results WHERE status >= 500`
- **Multi-endpoint rotation.** Weighted random or round-robin across your full API surface
- **POST bodies + headers.** Not just GET pings. Test real API payloads with auth tokens
- **Error body capture.** Logs the full response body on non-2xx so you know *why* it failed
- **CI/CD ready.** Threshold assertions with non-zero exit codes. Fail the pipeline if p95 > 500ms
- **Runtime-agnostic.** Works on Node.js (20+), Bun, and Deno. Bun gets zero-dep SQLite via `bun:sqlite`

## Quick Start

```bash
# Generate a starter config
npx dripfeed init

# Edit dripfeed.config.ts with your endpoints

# Run indefinitely (Ctrl+C to stop)
npx dripfeed run

# Run for a fixed duration
npx dripfeed run --duration 2h

# Run in CI with thresholds
npx dripfeed run --duration 10m --quiet
```

## Install

```bash
# Global
npm install -g dripfeed

# Project dependency
npm install dripfeed

# Or with other package managers
pnpm add dripfeed
yarn add dripfeed
bun add dripfeed
```

## Configuration

Create a `dripfeed.config.ts` (or `.json`, `.yaml`, `.toml`):

```typescript
import type { DripfeedConfig } from 'dripfeed';

const config: DripfeedConfig = {
  interval: '3s',
  timeout: '30s',
  storage: 'sqlite',
  rotation: 'weighted-random',
  headers: {
    Authorization: 'Bearer ${API_TOKEN}',
  },
  endpoints: [
    {
      name: 'get-users',
      url: 'https://api.example.com/v1/users',
      weight: 2,
    },
    {
      name: 'create-order',
      url: 'https://api.example.com/v1/orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { product_id: 'sku-123', quantity: 1 },
      weight: 1,
    },
  ],
  thresholds: {
    error_rate: '< 1%',
    p95: '< 500ms',
  },
};

export default config;
```

Environment variables are interpolated via `${VAR}` syntax from `process.env`.

## CLI

```
Usage: dripfeed <command> [options]

Commands:
  run       Start a soak test
  init      Generate a starter config file
  report    Generate a report from an existing SQLite database
  export    Export results to CSV or JSON

Run options:
  --duration, -d    Run duration (e.g. 30s, 10m, 2h). Omit for indefinite
  --interval, -i    Override config interval
  --db              SQLite database path (default: dripfeed-results.db)
  --report, -r      Report format: console, json, markdown
  --output, -o      Report output file path
  --quiet, -q       Suppress live console output
```

> **Note:** Using `--report json` or `--report markdown` automatically suppresses live console output so the report output is clean and parseable.

## Live Output

```
dripfeed v0.1.0 — every 3s | Ctrl+C to stop

✓ #1    get-users             200   142ms | ok:1 fail:0 (100.0%)
✓ #2    create-order          201   387ms | ok:2 fail:0 (100.0%)
✗ #3    get-users             500   891ms | ok:2 fail:1 (66.7%) | Internal Server Error
✓ #4    create-order          201   245ms | ok:3 fail:1 (75.0%)
```

On Ctrl+C, prints a summary with per-endpoint latency percentiles, error counts, and threshold pass/fail results.

## Library API

Use dripfeed programmatically in any Node.js/Bun application:

```typescript
import { createSoakTest, parseConfig, createConsoleReporter } from 'dripfeed';

// parseConfig validates and applies defaults to a raw config object
const config = parseConfig({
  interval: '3s',
  endpoints: [
    { name: 'health', url: 'https://api.example.com/health' },
  ],
});

const test = createSoakTest(config, [createConsoleReporter()]);

// Run for a fixed duration
const stats = await test.run({ duration: '10m' });
console.log(`Uptime: ${stats.uptime_pct}%`);

// Or start/stop manually
await test.start();
// ... later
const stats = await test.stop();
```

### Express.js

```typescript
import express from 'express';
import { createSoakTest, createMemoryStorage } from 'dripfeed';

const app = express();

// Start soak test alongside your server
const test = createSoakTest({
  interval: '10s',
  storage: 'memory',
  endpoints: [
    { name: 'self-health', url: 'http://localhost:3000/health' },
  ],
}, []);

test.start();

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/soak-status', async (req, res) => {
  const stats = await test.stop();
  res.json(stats);
});
```

### Next.js (API Route)

```typescript
// app/api/soak/route.ts
import { createSoakTest } from 'dripfeed';

export async function POST() {
  const test = createSoakTest({
    interval: '1s',
    storage: 'memory',
    endpoints: [
      { name: 'api', url: 'https://api.example.com/health' },
    ],
  }, []);

  const stats = await test.run({ duration: '30s' });
  return Response.json(stats);
}
```

### Hono

```typescript
import { Hono } from 'hono';
import { createSoakTest } from 'dripfeed';

const app = new Hono();

app.post('/soak', async (c) => {
  const test = createSoakTest({
    interval: '2s',
    storage: 'memory',
    endpoints: [
      { name: 'health', url: 'https://api.example.com/health' },
    ],
  }, []);

  const stats = await test.run({ duration: '1m' });
  return c.json(stats);
});
```

## Query Results

The SQLite database is the primary artifact. Query it after a run:

```bash
# Error count by endpoint
sqlite3 dripfeed-results.db "
  SELECT endpoint, COUNT(*) as errors
  FROM results WHERE status >= 400 OR status IS NULL
  GROUP BY endpoint ORDER BY errors DESC"

# Latency over time (1-minute buckets)
sqlite3 dripfeed-results.db "
  SELECT strftime('%H:%M', timestamp) as minute,
    ROUND(AVG(duration_ms)) as avg_ms, MAX(duration_ms) as max_ms
  FROM results GROUP BY minute ORDER BY minute"

# All error response bodies
sqlite3 dripfeed-results.db "
  SELECT timestamp, endpoint, status, response_body
  FROM results WHERE status >= 400 OR status IS NULL"
```

## Reports

```bash
# Generate from existing database
npx dripfeed report --db dripfeed-results.db --format json --output report.json
npx dripfeed report --format markdown --output report.md

# Export raw data
npx dripfeed export --format csv --output results.csv
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Soak test staging
  run: npx dripfeed run --duration 10m --quiet
  env:
    API_TOKEN: ${{ secrets.API_TOKEN }}
```

Threshold failures produce a non-zero exit code, failing the pipeline automatically.

## Thresholds

Define pass/fail criteria in your config:

```typescript
thresholds: {
  error_rate: '< 1%',      // fail if error rate exceeds 1%
  p95: '< 500ms',          // fail if p95 latency exceeds 500ms
  p99: '< 2000ms',         // fail if p99 exceeds 2 seconds
}
```

## Storage Adapters

| Adapter | Runtime | Dependencies | When to use |
|---------|---------|-------------|-------------|
| **SQLite** | Bun | Zero (`bun:sqlite` built-in) | Default on Bun |
| **SQLite** | Node.js | `better-sqlite3` (optional peer dep) | Default on Node |
| **JSON** | Any | Zero | Fallback if no SQLite available |
| **Memory** | Any | Zero | Tests and programmatic use |

Storage is auto-detected based on your runtime. Override with `storage: 'json'` in config.

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `interval` | `string` | `"3s"` | Time between requests (`500ms`, `1s`, `3s`, `5s`, `30s`, `1m`) |
| `timeout` | `string` | `"30s"` | Request timeout |
| `storage` | `string` | `"sqlite"` | Storage adapter: `sqlite`, `json`, `memory` |
| `db` | `string` | `"dripfeed-results.db"` | SQLite database path |
| `rotation` | `string` | `"weighted-random"` | Endpoint selection: `weighted-random`, `round-robin`, `sequential` |
| `headers` | `object` | `{}` | Global headers for all requests |
| `endpoints` | `array` | required | Endpoint definitions (see below) |
| `thresholds` | `object` | none | Pass/fail criteria |

### Endpoint options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | required | Human-readable label |
| `url` | `string` | required | Full URL |
| `method` | `string` | `"GET"` | HTTP method |
| `headers` | `object` | `{}` | Per-endpoint headers (merged with global) |
| `body` | `any` | none | JSON request body |
| `timeout` | `string` | global timeout | Per-endpoint timeout override |
| `weight` | `number` | `1` | Selection probability (higher = more frequent) |

## Good to Know

- **SQLite database location:** Created in the current working directory (default: `dripfeed-results.db`). Override with `db` config option or `--db` flag.
- **Multiple runs append:** Subsequent runs append to the same SQLite file. Delete the `.db` file between runs for fresh results, or use a unique `--db` path per run.
- **Minimum interval:** 100ms enforced floor to prevent accidental DoS. The tool is designed for 1-60 second intervals.
- **Serverless:** Use `storage: 'memory'` in serverless environments (Vercel, Lambda) where the filesystem is ephemeral. Pass a short `duration` to stay within function timeout limits.
- **HTML/PDF reports:** Not yet supported. Use the HTML print-to-PDF workflow: generate markdown, render in a browser, print to PDF.
- **Library API:** Use `parseConfig()` to validate raw config objects before passing to `createSoakTest()`. This applies Zod defaults (`interval`, `timeout`, `rotation`, etc.) that the runner requires.

## Contributing

```bash
git clone https://github.com/ph33nx/dripfeed.git
cd dripfeed
bun install
bun run test        # run tests
bun typecheck       # type check
bun run check       # lint + format
```

## License

MIT
